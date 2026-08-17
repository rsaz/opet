from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: uuid.uuid4().hex[:16]
    )
    title: Mapped[str] = mapped_column(String, default="New Conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    documents: Mapped[list[Document]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: uuid.uuid4().hex[:16]
    )
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String)  # "user", "assistant", "system"
    content: Mapped[str] = mapped_column(Text)
    sources_cited: Mapped[int] = mapped_column(Integer, default=0)
    # References the model offered that could not be found in the document. They are
    # never shown, but the count is, so a reader knows the answer over-reached.
    unverified_citations: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    citations: Mapped[list[Citation]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="Citation.ordinal",
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: uuid.uuid4().hex[:16]
    )
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    filename: Mapped[str] = mapped_column(String)
    file_path: Mapped[str] = mapped_column(String)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Per-page plain text, index 0 == page 1. Kept alongside `extracted_text` because
    # a citation has to be checkable against the exact page it claims to come from.
    pages: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    conversation: Mapped[Conversation] = relationship(back_populates="documents")


class Citation(Base):
    """A single reference from an assistant message back into the document.

    One row per citation the model produced, in the order it produced them. The
    `ordinal` is what the inline `#cite-N` anchor in the message body points at.
    """

    __tablename__ = "citations"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: uuid.uuid4().hex[:16]
    )
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    document_id: Mapped[str | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    ordinal: Mapped[int] = mapped_column(Integer)
    page: Mapped[int] = mapped_column(Integer)
    quote: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(String)
    # The passage as the document words it — what gets highlighted. Differs from
    # `quote` when the model's transcription drifted in whitespace or punctuation.
    matched_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # exact | normalised | partial. Only verified citations are ever stored.
    match_kind: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    message: Mapped[Message] = relationship(back_populates="citations")
