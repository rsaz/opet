"""Reading a document before anyone has asked it a question.

The chat is reactive: it answers what a lawyer thinks to ask. Someone opening an
unfamiliar 200-page lease does not yet know what to ask, and working that out *is*
the due diligence. So a document is read once on arrival and the terms a reviewer
would go looking for are pulled out — each one carrying the same verified citation
as an answer in the chat, because an extracted value nobody can check is worth no
more than an unsourced claim.

Fields are not fixed. A lease, a title report and an environmental assessment have
almost nothing in common, so the model decides what matters for the document in
front of it rather than filling in a form designed for something else.
"""

from __future__ import annotations

import structlog
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from takehome.services.citations import verify
from takehome.services.llm import MODEL, render_document

logger = structlog.get_logger()

SUMMARY_PROMPT = (
    "You are preparing a due diligence summary for a commercial real estate lawyer "
    "who has just opened this document and has not read it yet.\n\n"
    "Extract the terms they would go looking for first. Choose the terms that suit "
    "THIS document — a lease, a title report and an environmental assessment have "
    "little in common, so do not force a lease's headings onto something else.\n\n"
    "RULES:\n"
    "- Between 6 and 10 items. Fewer good ones beats more thin ones.\n"
    "- `label` is short and scannable: 'Rent', 'Break right', 'Permitted use', "
    "'Restrictive covenants', 'Contamination risk'.\n"
    "- `value` is one or two sentences of plain English stating what the document "
    "actually says. Include the figures and dates — a lawyer wants the number.\n"
    "- Lead with anything that would cost the client money or kill a deal: "
    "conditions on a right, upward-only reviews, break premiums, restrictive "
    "covenants, remediation costs, missing schedules. A right with conditions "
    "attached is not the same as a right, and the summary must say so.\n"
    "- Set `risk` to true for items a reviewer needs to escalate rather than merely "
    "note.\n"
    "- Every item carries at least one citation with an EXACT quote copied "
    "character-for-character from the page you name, 5 to 40 words. Never quote a "
    "running header or a page number.\n"
    "- If you cannot support an item with an exact quote, leave the item out.\n"
    "- Never state anything the document does not say. If a schedule is referenced "
    "but not included, that absence is itself worth an item."
)


class SummaryCitation(BaseModel):
    page: int = Field(description="The page the quote appears on")
    quote: str = Field(description="Exact text copied from that page")
    label: str = Field(description="How a lawyer would refer to it, e.g. 'clause 8.3.1'")


class SummaryItem(BaseModel):
    label: str = Field(description="Short scannable name for the term")
    value: str = Field(description="What the document says, in plain English")
    risk: bool = Field(default=False, description="Whether a reviewer should escalate this")
    citations: list[SummaryCitation] = Field(default_factory=list)


class ExtractedSummary(BaseModel):
    document_type: str = Field(description="e.g. 'Commercial lease', 'Title report'")
    items: list[SummaryItem]


summary_agent = Agent(MODEL, output_type=ExtractedSummary, system_prompt=SUMMARY_PROMPT)


class VerifiedCitation(BaseModel):
    page: int
    quote: str
    label: str
    matched_text: str
    match_kind: str


class VerifiedItem(BaseModel):
    label: str
    value: str
    risk: bool
    citations: list[VerifiedCitation]


class VerifiedSummary(BaseModel):
    document_type: str
    items: list[VerifiedItem]


async def extract_summary(filename: str, pages: list[str]) -> VerifiedSummary:
    """Read the document and return the key terms, every citation checked.

    An item whose citations all fail verification is dropped entirely rather than
    shown without support. In the chat an unsupported sentence is at least visibly
    unsupported; in a summary table a row with no source reads exactly like a row
    with one, so the only honest option is to leave it out.
    """
    result = await summary_agent.run(render_document(filename, pages))
    extracted = result.output

    items: list[VerifiedItem] = []
    dropped_citations = 0

    for item in extracted.items:
        verified: list[VerifiedCitation] = []
        for citation in item.citations:
            match = verify(citation.quote, pages, citation.page)
            if match is None:
                dropped_citations += 1
                continue
            verified.append(
                VerifiedCitation(
                    page=match.page,
                    quote=citation.quote,
                    label=citation.label,
                    matched_text=match.text,
                    match_kind=str(match.kind),
                )
            )

        if not verified:
            logger.warning(
                "Dropped unsupported summary item",
                filename=filename,
                label=item.label,
            )
            continue

        items.append(
            VerifiedItem(
                label=item.label,
                value=item.value,
                risk=item.risk,
                citations=verified,
            )
        )

    logger.info(
        "Extracted document summary",
        filename=filename,
        document_type=extracted.document_type,
        items=len(items),
        dropped_items=len(extracted.items) - len(items),
        dropped_citations=dropped_citations,
    )

    return VerifiedSummary(document_type=extracted.document_type, items=items)
