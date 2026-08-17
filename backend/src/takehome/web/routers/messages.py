from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import StreamingResponse

from takehome.db.models import Citation, Message
from takehome.db.session import get_session
from takehome.services.citations import CitationMatch, verify
from takehome.services.conversation import get_conversation, update_conversation
from takehome.services.document import get_document_for_conversation
from takehome.services.llm import (
    CitationDraft,
    TextChunk,
    chat_with_document,
    generate_title,
)

logger = structlog.get_logger()

router = APIRouter(tags=["messages"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class CitationOut(BaseModel):
    id: str
    ordinal: int
    page: int
    quote: str
    label: str
    matched_text: str | None = None
    match_kind: str | None = None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    sources_cited: int
    unverified_citations: int = 0
    created_at: datetime
    citations: list[CitationOut] = []

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str


_NUMBERED_LABEL = re.compile(
    r"^(?:clause|section|paragraph)?\s*(\d[\d.]*(?:\([^)]{1,4}\))?)", re.IGNORECASE
)


def _short_label(label: str) -> str:
    """Shorten 'clause 8.3.1(c)' — or a bare '8.3.1(c)' — to '§8.3.1(c)'.

    A chip sits inside a sentence a lawyer is reading closely, so it has to be a
    reference rather than a phrase. Labels with no number at all ('Definitions') are
    left alone — a § in front of a word would be wrong.
    """
    match = _NUMBERED_LABEL.match(label.strip())
    return f"§{match.group(1)}" if match else label.strip()


def _citation_link(ordinal: int, label: str, page: int) -> str:
    """The inline form a citation takes inside the stored answer.

    A markdown link rather than a bespoke token, so the answer stays valid markdown
    and the `#cite-N` anchor gives the UI a stable handle to turn into a chip.
    """
    return f"[{_short_label(label)} · p{page}](#cite-{ordinal})"


def _serialise(message: Message, citations: list[Citation]) -> dict[str, object]:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "role": message.role,
        "content": message.content,
        "sources_cited": message.sources_cited,
        "unverified_citations": message.unverified_citations,
        "created_at": message.created_at.isoformat(),
        "citations": [
            {
                "id": c.id,
                "ordinal": c.ordinal,
                "page": c.page,
                "quote": c.quote,
                "label": c.label,
                "matched_text": c.matched_text,
                "match_kind": c.match_kind,
            }
            for c in citations
        ],
    }


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_messages(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[MessageOut]:
    """List all messages in a conversation, ordered by creation time."""
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .options(selectinload(Message.citations))
    )
    result = await session.execute(stmt)
    messages = list(result.scalars().all())

    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role,
            content=m.content,
            sources_cited=m.sources_cited,
            unverified_citations=m.unverified_citations,
            created_at=m.created_at,
            citations=[CitationOut.model_validate(c) for c in m.citations],
        )
        for m in messages
    ]


@router.post("/api/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Send a user message and stream back the AI response via SSE."""
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save the user message
    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
    )
    session.add(user_message)
    await session.commit()
    await session.refresh(user_message)

    logger.info("User message saved", conversation_id=conversation_id, message_id=user_message.id)

    # Load the document for the conversation. `pages` is what the model is shown and
    # what a citation is later checked against.
    document = await get_document_for_conversation(session, conversation_id)
    document_id: str | None = document.id if document else None
    filename: str | None = document.filename if document else None
    pages: list[str] | None = document.pages if document else None

    # Load conversation history (exclude the message we just saved, it will be the user_message param)
    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.id != user_message.id)
        .order_by(Message.created_at.asc())
    )
    result = await session.execute(stmt)
    history_messages = list(result.scalars().all())

    conversation_history: list[dict[str, str]] = [
        {"role": m.role, "content": m.content} for m in history_messages
    ]

    # A conversation holding a document is already named after it, and that name is
    # more useful than anything a question could produce. Only untitled, document-less
    # conversations get a generated title.
    user_msg_count = sum(1 for m in history_messages if m.role == "user")
    is_first_message = user_msg_count == 0 and document is None

    async def event_stream() -> AsyncIterator[str]:
        """Generate SSE events with the streamed LLM response."""
        full_response = ""
        verified: list[tuple[CitationDraft, CitationMatch]] = []
        rejected = 0

        # A fresh session, since the request-scoped one may be closed by the time
        # the stream finishes.
        from takehome.db.session import async_session as session_factory

        try:
            async for event in chat_with_document(
                user_message=body.content,
                filename=filename,
                pages=pages,
                conversation_history=conversation_history,
            ):
                if isinstance(event, TextChunk):
                    full_response += event.text
                    text_event = json.dumps({"type": "content", "content": event.text})
                    yield f"data: {text_event}\n\n"
                    continue

                # A citation. Check it against the document before it is allowed
                # anywhere near the answer — a quote that isn't in the document is
                # dropped, leaving the claim visibly unsupported rather than falsely
                # supported.
                match = verify(event.quote, pages or [], event.page)
                if match is None:
                    rejected += 1
                    logger.warning(
                        "Rejected unverifiable citation",
                        conversation_id=conversation_id,
                        claimed_page=event.page,
                        label=event.label,
                        quote=event.quote[:120],
                    )
                    continue

                verified.append((event, match))
                ordinal = len(verified)
                link = _citation_link(ordinal, event.label, match.page)
                full_response += link
                link_event = json.dumps({"type": "content", "content": link})
                yield f"data: {link_event}\n\n"
                citation_event = json.dumps(
                    {
                        "type": "citation",
                        "citation": {
                            "ordinal": ordinal,
                            "page": match.page,
                            "quote": event.quote,
                            "label": event.label,
                            "matched_text": match.text,
                            "match_kind": str(match.kind),
                        },
                    }
                )
                yield f"data: {citation_event}\n\n"

        except Exception:
            logger.exception(
                "Error during LLM streaming",
                conversation_id=conversation_id,
            )
            # Leave no false record. Previously the apology was saved as the
            # assistant's answer, which made a failed request indistinguishable
            # from a real one for anyone reading the transcript later — in a legal
            # matter, that is a worse outcome than the failure itself. Drop the
            # user's turn too, so the conversation is exactly as it was and the
            # question can simply be asked again.
            async with session_factory() as cleanup_session:
                await cleanup_session.execute(delete(Message).where(Message.id == user_message.id))
                await cleanup_session.commit()

            error_event = json.dumps(
                {
                    "type": "error",
                    "error": "The assistant could not answer that. Nothing was saved.",
                }
            )
            yield f"data: {error_event}\n\n"
            return

        async with session_factory() as save_session:
            assistant_message = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
                sources_cited=len(verified),
                unverified_citations=rejected,
            )
            save_session.add(assistant_message)
            await save_session.commit()
            await save_session.refresh(assistant_message)

            citations = [
                Citation(
                    message_id=assistant_message.id,
                    document_id=document_id,
                    ordinal=ordinal,
                    page=match.page,
                    quote=draft.quote,
                    label=draft.label,
                    matched_text=match.text,
                    match_kind=str(match.kind),
                )
                for ordinal, (draft, match) in enumerate(verified, start=1)
            ]
            if citations:
                save_session.add_all(citations)
                await save_session.commit()
                for citation in citations:
                    await save_session.refresh(citation)

            logger.info(
                "Assistant message saved",
                conversation_id=conversation_id,
                message_id=assistant_message.id,
                citations=len(citations),
                rejected_citations=rejected,
            )

            # Auto-generate title from first user message
            if is_first_message:
                try:
                    title = await generate_title(body.content)
                    await update_conversation(save_session, conversation_id, title)
                    logger.info(
                        "Auto-generated conversation title",
                        conversation_id=conversation_id,
                        title=title,
                    )
                except Exception:
                    logger.exception(
                        "Failed to generate title",
                        conversation_id=conversation_id,
                    )

            # Send the final message event with the complete assistant message
            message_data = json.dumps(
                {
                    "type": "message",
                    "message": _serialise(assistant_message, citations),
                }
            )
            yield f"data: {message_data}\n\n"

            # Send the done signal
            done_data = json.dumps(
                {
                    "type": "done",
                    "sources_cited": len(citations),
                    "message_id": assistant_message.id,
                }
            )
            yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
