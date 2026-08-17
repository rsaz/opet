"""Store the key terms extracted from a document on arrival

Revision ID: 005_summaries
Revises: 004_unverified
Create Date: 2026-08-17 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_summaries"
down_revision: str | None = "004_unverified"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "summary_items",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("risk", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("document_type", sa.String(), nullable=True),
        # Citations are stored with the item rather than in the citations table,
        # which is keyed to a message. A summary term has no message behind it.
        sa.Column("citations", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_summary_items_document_id", "summary_items", ["document_id"])


def downgrade() -> None:
    op.drop_index("ix_summary_items_document_id", table_name="summary_items")
    op.drop_table("summary_items")
