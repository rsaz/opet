"""Remember how many references were dropped as unverifiable

Revision ID: 004_unverified
Revises: 003_citation_match
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_unverified"
down_revision: str | None = "003_citation_match"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Citations that failed verification are never shown, but silently discarding
    # them would hide the one thing a lawyer most needs to know: that the assistant
    # said something it could not evidence.
    op.add_column(
        "messages",
        sa.Column(
            "unverified_citations",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "unverified_citations")
