"""Tests for citation verification.

This is the logic that decides whether a claim gets a source or gets nothing, so
the cases worth pinning down are the ones where being wrong is expensive: a quote
the model invented must never be accepted, and a quote the model got slightly wrong
must not be thrown away.

The fixtures below reproduce what PyMuPDF actually produces from the sample lease —
notably line breaks in the middle of clauses, which is why exact matching alone is
not enough.
"""

from __future__ import annotations

import pytest

from takehome.services.citations import MatchKind, find_quote, normalise, verify

# Extracted text keeps the line breaks the PDF laid out, mid-sentence and all.
PAGE_7 = """8.3 Conditions for Exercise of Break
8.3.1 The Tenant's right to determine this Lease on a Break Date shall be conditional
upon the following conditions being satisfied on or before the relevant Break Date:
(a) there is no material breach by the Tenant of any of the Tenant's covenants in
this Lease which remains unremedied at the Break Date;
(c) the Tenant pays to the Landlord on or before the Break Date a sum equivalent to
six (6) months' rent at the rate payable immediately before the Break Date (the
"Break Premium"), such payment to be made by way of cleared funds."""

PAGE_5 = """4.2.3 The cost of the Landlord's obligations under this clause 4.2 shall be
recoverable from the Tenant as part of the service charge in accordance with
Schedule 3 hereto, the Tenant's proportion being 18.7%."""

PAGES = ["cover page", "", "", "", PAGE_5, "", PAGE_7]


class TestNormalise:
    def test_maps_every_folded_character_back_to_its_origin(self) -> None:
        folded, origins = normalise("A  B")
        assert folded == "a b"
        assert len(origins) == len(folded)
        # The space in the folded text points at the first of the two originals.
        assert origins == [0, 1, 3]

    def test_folds_the_characters_pdfs_and_models_disagree_about(self) -> None:
        folded, _ = normalise("The “Break’s” – Date")
        assert folded == 'the "break\'s" - date'

    def test_collapses_line_breaks_to_single_spaces(self) -> None:
        folded, _ = normalise("six (6)\nmonths'\n  rent")
        assert folded == "six (6) months' rent"


class TestFindQuote:
    def test_exact_substring_is_reported_as_exact(self) -> None:
        match = find_quote("Break Premium", PAGE_7, 7)
        assert match is not None
        assert match.kind is MatchKind.EXACT
        assert PAGE_7[match.start : match.end] == "Break Premium"

    def test_quote_spanning_a_line_break_still_matches(self) -> None:
        # The model reads the clause as prose; the page has a newline inside it.
        match = find_quote(
            "a sum equivalent to six (6) months' rent at the rate payable",
            PAGE_7,
            7,
        )
        assert match is not None
        assert match.kind is MatchKind.NORMALISED
        assert "six (6)" in match.text
        assert "\n" in match.text  # the span is the document's own characters

    def test_curly_quotes_and_case_do_not_defeat_a_match(self) -> None:
        match = find_quote("THE “BREAK PREMIUM”", PAGE_7, 7)
        assert match is not None
        assert match.kind is MatchKind.NORMALISED

    def test_a_dropped_word_degrades_to_partial_rather_than_failing(self) -> None:
        # "on or before the Break Date" is missing "or before".
        match = find_quote(
            "the Tenant pays to the Landlord on the Break Date a sum equivalent to "
            "six (6) months' rent at the rate payable",
            PAGE_7,
            7,
        )
        assert match is not None
        assert match.kind is MatchKind.PARTIAL

    def test_invented_quote_is_rejected(self) -> None:
        assert (
            find_quote(
                "The Tenant shall have the right to renew this Lease for a further "
                "term of ten years",
                PAGE_7,
                7,
            )
            is None
        )

    def test_a_short_coincidental_run_is_not_evidence(self) -> None:
        # Shares "the Tenant" with the page, and nothing else worth having.
        assert find_quote("the Tenant is hereby granted a parking space", PAGE_7, 7) is None

    @pytest.mark.parametrize("quote", ["", "   ", "\n"])
    def test_empty_quotes_are_rejected(self, quote: str) -> None:
        assert find_quote(quote, PAGE_7, 7) is None

    def test_empty_page_is_rejected(self) -> None:
        assert find_quote("Break Premium", "", 2) is None


class TestVerify:
    def test_prefers_the_claimed_page(self) -> None:
        match = verify("Break Premium", PAGES, 7)
        assert match is not None
        assert match.page == 7

    def test_corrects_a_misnumbered_page(self) -> None:
        # Accurate quote, wrong page. The model told the truth about the document,
        # so the citation is kept and the page fixed rather than discarded.
        match = verify("the Tenant's proportion being 18.7%", PAGES, 2)
        assert match is not None
        assert match.page == 5

    def test_survives_a_page_number_outside_the_document(self) -> None:
        match = verify("Break Premium", PAGES, 99)
        assert match is not None
        assert match.page == 7

    def test_a_partial_match_alone_does_not_override_the_claimed_page(self) -> None:
        # Only a partial match exists, and it is on a page the model did not name —
        # too weak to justify moving the citation somewhere else.
        assert (
            verify(
                "the Tenant pays to the Landlord on the Break Date a sum equivalent "
                "to six (6) months' rent at the rate payable",
                PAGES,
                3,
            )
            is None
        )

    def test_invented_quote_is_rejected_across_the_whole_document(self) -> None:
        assert verify("capped at 5% per annum", PAGES, 5) is None

    def test_no_pages_means_nothing_can_be_verified(self) -> None:
        assert verify("Break Premium", [], 7) is None
