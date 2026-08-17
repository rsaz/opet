"""Record where a citation was actually found in the document

Revision ID: 003_citation_match
Revises: 002_citations
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_citation_match"
down_revision: str | None = "002_citations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The passage in the document's own words, which is what gets highlighted — the
    # model's quote may differ in whitespace, quote marks or a dropped word.
    op.add_column("citations", sa.Column("matched_text", sa.Text(), nullable=True))
    # exact | normalised | partial — a partial match is real but weaker, and the
    # difference is worth keeping rather than flattening.
    op.add_column("citations", sa.Column("match_kind", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("citations", "match_kind")
    op.drop_column("citations", "matched_text")
