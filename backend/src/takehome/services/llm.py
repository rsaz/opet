from __future__ import annotations

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export

MODEL = "anthropic:claude-haiku-4-5-20251001"

# The marker the model wraps around every citation. Parsed out of the stream before
# any text reaches the client, so the user never sees the raw syntax.
CITE_OPEN = "[[cite:"
CITE_CLOSE = "]]"

SYSTEM_PROMPT = (
    "You are a legal document assistant for commercial real estate lawyers doing due "
    "diligence. You answer questions about the document they are reviewing.\n\n"
    "GROUNDING — this matters more than anything else:\n"
    "- Answer only from the document provided. Never use outside knowledge about the "
    "property, the parties, or what a lease of this kind usually says.\n"
    "- If the document does not answer the question, say so plainly and stop. If the "
    "document refers to a schedule, annex or plan that is not included in the text you "
    "were given, say that it is referenced but not part of this document. Never infer "
    "what a missing part probably says.\n\n"
    "CITATIONS — every factual claim about the document must carry one:\n"
    "- After a claim, add a marker: [[cite:PAGE|EXACT QUOTE|LABEL]]\n"
    "- Place the marker AFTER the sentence's closing punctuation, never before it. "
    "Write 'The rent is £850,000.[[cite:...]]', not 'The rent is £850,000[[cite:...]].'\n"
    "- PAGE is the page number the quote appears on.\n"
    "- EXACT QUOTE is copied character-for-character from that page. Do not paraphrase, "
    "correct, shorten with ellipses, or fix spelling. Quote between 5 and 40 words — "
    "enough to be findable, short enough to be a pinpoint.\n"
    "- LABEL is how a lawyer would refer to it: 'clause 8.3.1', 'Section 3', "
    "'Charges Register entry 2'. If the passage has no number, use a short descriptive "
    "label such as 'Definitions'.\n"
    "- Never quote a running header, footer or page number — quote the substance.\n"
    "- A claim you cannot support with an exact quote is a claim you should not make.\n\n"
    "STYLE:\n"
    "- Be concise and precise. Lawyers value accuracy over volume.\n"
    "- Lead with the answer, then the detail that qualifies it.\n"
    "- Flag conditions, carve-outs and traps explicitly — a right that is conditional is "
    "not the same as a right.\n\n"
    "Example:\n"
    "The tenant may break on 1 January 2029 or 1 January 2034.[[cite:7|The Tenant may "
    "determine this Lease on the fifth (5th) anniversary of the Term Commencement Date|"
    "clause 8.1.1]] The break is conditional on paying a premium of six months' "
    "rent.[[cite:7|the Tenant pays to the Landlord on or before the Break Date a sum "
    "equivalent to six (6) months' rent|clause 8.3.1]]"
)

agent = Agent(MODEL, system_prompt=SYSTEM_PROMPT)

# Titles are a separate, unrelated job — giving the titling call the citation rules
# above would only invite it to emit markers into a conversation title.
title_agent = Agent(
    MODEL,
    system_prompt=(
        "You write short conversation titles. Reply with the title only — no quotes, "
        "no punctuation at the end, no explanation."
    ),
)


@dataclass(frozen=True)
class TextChunk:
    """A piece of answer prose, safe to show to the user as-is."""

    text: str


@dataclass(frozen=True)
class CitationDraft:
    """A citation the model produced. Not yet checked against the document."""

    page: int
    quote: str
    label: str


StreamEvent = TextChunk | CitationDraft


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await title_agent.run(
        f"Write a concise 3-5 word title for a conversation that starts with: '{user_message}'"
    )
    title = str(result.output).strip().strip('"').strip("'")
    if len(title) > 100:
        title = title[:97] + "..."
    return title


def render_document(filename: str, pages: list[str]) -> str:
    """Render the document for the prompt with page numbers the model can cite."""
    parts = [f'<document filename="{filename}" pages="{len(pages)}">']
    for index, text in enumerate(pages):
        if not text.strip():
            continue
        parts.append(f'<page number="{index + 1}">\n{text.rstrip()}\n</page>')
    parts.append("</document>")
    return "\n".join(parts)


_CITE_LINK = re.compile(r"\[([^\]]*)\]\(#cite-\d+\)")


def strip_citation_links(content: str) -> str:
    """Reduce a stored answer back to plain prose for use as conversation history.

    Stored answers carry inline `[label](#cite-3)` links. Feeding those back verbatim
    invites the model to imitate the rendered form instead of emitting fresh markers.
    """
    return _CITE_LINK.sub(r"(\1)", content)


def _held_back(buffer: str) -> int:
    """How many trailing characters could still turn into a citation marker.

    A chunk boundary can land in the middle of `[[cite:`, so any suffix of the buffer
    that is a prefix of the opening marker has to be held until more text arrives —
    otherwise half a marker leaks into the answer.
    """
    for size in range(min(len(buffer), len(CITE_OPEN) - 1), 0, -1):
        if CITE_OPEN.startswith(buffer[-size:]):
            return size
    return 0


def parse_citation(raw: str) -> CitationDraft | None:
    """Parse the inside of a `[[cite:...]]` marker. Returns None if it is malformed.

    Split on the first and last separator rather than all of them, so a quote
    containing a pipe survives intact.
    """
    parts = raw.split("|")
    if len(parts) < 3:
        return None
    page_part, label = parts[0], parts[-1]
    quote = "|".join(parts[1:-1]).strip()
    label = label.strip()
    try:
        page = int(page_part.strip())
    except ValueError:
        return None
    if page < 1 or not quote or not label:
        return None
    return CitationDraft(page=page, quote=quote, label=label)


async def chat_with_document(
    user_message: str,
    filename: str | None,
    pages: list[str] | None,
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[StreamEvent]:
    """Stream an answer, yielding prose and citations as separate events.

    The model writes citations inline as `[[cite:...]]` markers. They are pulled out of
    the token stream here so the client only ever receives finished prose and finished
    citations — never a half-written marker.
    """
    prompt_parts: list[str] = []

    if pages:
        prompt_parts.append(render_document(filename or "document.pdf", pages))
        prompt_parts.append("")
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
            "tell them they need to upload one first.\n"
        )

    if conversation_history:
        prompt_parts.append("Earlier in this conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {strip_citation_links(content)}\n")
        prompt_parts.append("")

    prompt_parts.append(f"User: {user_message}")
    full_prompt = "\n".join(prompt_parts)

    buffer = ""
    async with agent.run_stream(full_prompt) as result:
        async for delta in result.stream_text(delta=True):
            buffer += delta
            while True:
                start = buffer.find(CITE_OPEN)
                if start == -1:
                    hold = _held_back(buffer)
                    safe = buffer[: len(buffer) - hold] if hold else buffer
                    buffer = buffer[len(buffer) - hold :] if hold else ""
                    if safe:
                        yield TextChunk(safe)
                    break

                if start > 0:
                    yield TextChunk(buffer[:start])
                    buffer = buffer[start:]

                end = buffer.find(CITE_CLOSE, len(CITE_OPEN))
                if end == -1:
                    break  # marker still arriving

                citation = parse_citation(buffer[len(CITE_OPEN) : end])
                buffer = buffer[end + len(CITE_CLOSE) :]
                if citation is not None:
                    yield citation

    # Whatever is left was never a marker after all.
    if buffer:
        yield TextChunk(buffer)
