"""Checking a model's citation against the document it claims to come from.

The rule this module exists to enforce: the app never shows a citation it cannot
find in the document. A quote the model invented is dropped, so the claim it was
attached to appears with no source rather than with a false one. Saying less is the
right failure mode for a tool a lawyer relies on.

Matching cannot be exact-only. PDF text extraction and a model's transcription of it
disagree about ligatures, curly quotes, hyphens and line-break whitespace, and a model
will occasionally drop a word from the middle of a long quote. So there are three
tiers, tried in order, and the tier is recorded — a partial match is a real match, but
it is not the same thing as an exact one.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from enum import StrEnum

# Characters PDF extraction and language models routinely disagree about.
_SUBSTITUTIONS = {
    "‘": "'",
    "’": "'",
    "‚": "'",
    "“": '"',
    "”": '"',
    "„": '"',
    "–": "-",
    "—": "-",
    "−": "-",
    " ": " ",
    "…": "...",
}

# A partial match has to be long enough to be evidence rather than coincidence.
_MIN_PARTIAL_CHARS = 30
_MIN_PARTIAL_RATIO = 0.6


class MatchKind(StrEnum):
    EXACT = "exact"
    NORMALISED = "normalised"
    PARTIAL = "partial"


@dataclass(frozen=True)
class CitationMatch:
    """Where a quote was actually found, in the document's own characters."""

    page: int
    start: int
    end: int
    kind: MatchKind
    text: str
    """The passage as the document words it, which may differ from the model's quote."""


def normalise(text: str) -> tuple[str, list[int]]:
    """Fold text for comparison, and map every folded character back to its origin.

    The map is what makes the tiers useful: a match is found in normalised space but
    has to be reported as a span of the original text, because that is what a reader
    will eventually be shown.
    """
    folded: list[str] = []
    origins: list[int] = []
    previous_was_space = False

    for index, char in enumerate(text):
        substituted = _SUBSTITUTIONS.get(char, char)
        for expanded in unicodedata.normalize("NFKC", substituted):
            if expanded.isspace():
                if previous_was_space:
                    continue
                folded.append(" ")
                origins.append(index)
                previous_was_space = True
                continue
            previous_was_space = False
            for cased in expanded.casefold():
                folded.append(cased)
                origins.append(index)

    return "".join(folded), origins


def _span(origins: list[int], start: int, end: int, text: str) -> tuple[int, int]:
    """Translate a span in normalised space back to a span of the original text."""
    if not origins or start >= len(origins):
        return 0, 0
    original_start = origins[start]
    original_end = origins[min(end, len(origins)) - 1] + 1
    return original_start, min(original_end, len(text))


def find_quote(quote: str, page_text: str, page: int) -> CitationMatch | None:
    """Find `quote` on one page, exactly if possible and approximately if not."""
    if not quote.strip() or not page_text.strip():
        return None

    exact_at = page_text.find(quote)
    if exact_at != -1:
        return CitationMatch(
            page=page,
            start=exact_at,
            end=exact_at + len(quote),
            kind=MatchKind.EXACT,
            text=page_text[exact_at : exact_at + len(quote)],
        )

    folded_quote, _ = normalise(quote)
    folded_page, page_origins = normalise(page_text)
    folded_quote = folded_quote.strip()
    if not folded_quote:
        return None

    at = folded_page.find(folded_quote)
    if at != -1:
        start, end = _span(page_origins, at, at + len(folded_quote), page_text)
        return CitationMatch(
            page=page,
            start=start,
            end=end,
            kind=MatchKind.NORMALISED,
            text=page_text[start:end],
        )

    # Nothing matched whole. Accept the longest run the two agree on, provided it is
    # a substantial part of the quote — that covers a model dropping a word or two,
    # without letting a handful of common words masquerade as a source.
    matcher = SequenceMatcher(None, folded_quote, folded_page, autojunk=False)
    longest = matcher.find_longest_match(0, len(folded_quote), 0, len(folded_page))
    threshold = max(_MIN_PARTIAL_CHARS, int(len(folded_quote) * _MIN_PARTIAL_RATIO))
    if longest.size < threshold:
        return None

    start, end = _span(page_origins, longest.b, longest.b + longest.size, page_text)
    return CitationMatch(
        page=page,
        start=start,
        end=end,
        kind=MatchKind.PARTIAL,
        text=page_text[start:end],
    )


def verify(quote: str, pages: list[str], claimed_page: int) -> CitationMatch | None:
    """Check a quote against the document, returning where it really is.

    The claimed page is tried first. If the quote is not there, the rest of the
    document is searched before giving up: a model that quotes accurately but
    misnumbers the page has still told the truth about the document, and correcting
    the page is more useful to a lawyer than discarding a good citation.
    """
    if not pages:
        return None

    if 1 <= claimed_page <= len(pages):
        found = find_quote(quote, pages[claimed_page - 1], claimed_page)
        if found is not None:
            return found

    for index, page_text in enumerate(pages):
        page = index + 1
        if page == claimed_page:
            continue
        found = find_quote(quote, page_text, page)
        # Only trust a confident match when overriding the page the model named.
        if found is not None and found.kind is not MatchKind.PARTIAL:
            return found

    return None
