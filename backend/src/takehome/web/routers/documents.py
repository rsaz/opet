from __future__ import annotations

import os
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from takehome.db.models import SummaryItem
from takehome.db.session import get_session
from takehome.services.conversation import get_conversation
from takehome.services.document import get_document, upload_document
from takehome.services.summary import extract_summary

logger = structlog.get_logger()

router = APIRouter(tags=["documents"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class SummaryCitationOut(BaseModel):
    page: int
    quote: str
    label: str
    matched_text: str | None = None
    match_kind: str | None = None


class SummaryItemOut(BaseModel):
    id: str
    label: str
    value: str
    risk: bool
    citations: list[SummaryCitationOut] = []


class SummaryOut(BaseModel):
    document_id: str
    document_type: str | None = None
    items: list[SummaryItemOut] = []


class DocumentOut(BaseModel):
    id: str
    conversation_id: str
    filename: str
    page_count: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post(
    "/api/conversations/{conversation_id}/documents",
    response_model=DocumentOut,
    status_code=201,
)
async def upload_document_endpoint(
    conversation_id: str,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Upload a PDF document for a conversation.

    Only one document per conversation is allowed. Returns 409 if a document
    already exists.
    """
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        document = await upload_document(session, conversation_id, file)
    except ValueError as e:
        error_message = str(e)
        if "already has a document" in error_message:
            raise HTTPException(status_code=409, detail=error_message) from e
        raise HTTPException(status_code=400, detail=error_message) from e

    logger.info(
        "Document uploaded",
        conversation_id=conversation_id,
        document_id=document.id,
        filename=document.filename,
    )

    return DocumentOut(
        id=document.id,
        conversation_id=document.conversation_id,
        filename=document.filename,
        page_count=document.page_count,
        uploaded_at=document.uploaded_at,
    )


@router.get("/api/documents/{document_id}/content")
async def serve_document_file(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve the raw PDF file for download/viewing."""
    document = await get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=document.file_path,
        filename=document.filename,
        media_type="application/pdf",
    )


@router.get("/api/documents/{document_id}/summary", response_model=SummaryOut)
async def get_document_summary(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> SummaryOut:
    """Key terms for a document, extracted on first request and cached after.

    Extraction is deliberately not part of the upload. Upload should feel instant —
    the reader wants to see their document — and reading it properly takes a
    round-trip the upload has no reason to wait for.
    """
    document = await get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    stmt = (
        select(SummaryItem)
        .where(SummaryItem.document_id == document_id)
        .order_by(SummaryItem.ordinal.asc())
    )
    existing = list((await session.execute(stmt)).scalars().all())

    if not existing:
        if not document.pages:
            return SummaryOut(document_id=document_id)

        summary = await extract_summary(document.filename, document.pages)
        existing = [
            SummaryItem(
                document_id=document_id,
                ordinal=ordinal,
                label=item.label,
                value=item.value,
                risk=item.risk,
                document_type=summary.document_type,
                citations=[c.model_dump() for c in item.citations],
            )
            for ordinal, item in enumerate(summary.items, start=1)
        ]
        if existing:
            session.add_all(existing)
            await session.commit()
            for item in existing:
                await session.refresh(item)

    return SummaryOut(
        document_id=document_id,
        document_type=existing[0].document_type if existing else None,
        items=[
            SummaryItemOut(
                id=item.id,
                label=item.label,
                value=item.value,
                risk=item.risk,
                citations=[SummaryCitationOut.model_validate(c) for c in item.citations],
            )
            for item in existing
        ],
    )
