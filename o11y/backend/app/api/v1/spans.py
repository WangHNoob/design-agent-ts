import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app import schemas
from app.models import Span, Trace, Session
from app.events import event_bus

logger = logging.getLogger(__name__)
router = APIRouter(tags=["spans"])

from datetime import timezone

def _utc(dt):
    """Ensure datetime has UTC timezone so FastAPI serializes with Z suffix."""
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def _serialize_span(span):
    error_message = _extract_error_message(span)
    return {
        "id": span.id,
        "trace_id": span.trace_id,
        "session_id": span.session_id,
        "parent_span_id": span.parent_span_id,
        "name": span.name,
        "span_type": span.span_type,
        "start_time": _utc(span.start_time),
        "end_time": _utc(span.end_time),
        "duration_ms": span.duration_ms,
        "input_data": json.loads(span.input_data) if span.input_data else None,
        "output_data": json.loads(span.output_data) if span.output_data else None,
        "metadata": json.loads(span.metadata_json) if span.metadata_json else None,
        "status": span.status,
        "error_message": error_message,
    }

def _extract_error_message(span) -> str | None:
    if span.status != "error":
        return None
    try:
        od = json.loads(span.output_data) if isinstance(span.output_data, str) else span.output_data
        if isinstance(od, dict):
            return od.get("error_message") or od.get("error") or od.get("message")
        elif isinstance(od, str):
            return od[:200]
    except (json.JSONDecodeError, TypeError):
        pass
    if span.output_data:
        try:
            return str(span.output_data)[:200]
        except Exception:
            pass
    return None

@router.post("/batch", status_code=202)
async def create_spans_batch(
    payload: schemas.BatchSpanIn,
    background_tasks: BackgroundTasks,
):
    """Receive spans batch and return immediately. DB writes are deferred to background."""
    if not payload.spans:
        return {"received": 0}
    background_tasks.add_task(_persist_spans, payload)
    return {"received": len(payload.spans)}


async def _persist_spans(payload: schemas.BatchSpanIn):
    """Background task: persist span batch with its own DB session."""
    async with AsyncSessionLocal() as db:
        try:
            session_ids = list({s.session_id for s in payload.spans})
            trace_ids = list({s.trace_id for s in payload.spans})

            # Parallel existence checks
            existing_sessions, existing_traces = await asyncio.gather(
                _existing_ids(db, Session, session_ids),
                _existing_ids(db, Trace, trace_ids),
            )

            for sid in session_ids:
                if sid not in existing_sessions:
                    db.add(Session(id=sid, name=sid[:8]))
            for tid in trace_ids:
                if tid not in existing_traces:
                    sess_id = next((s.session_id for s in payload.spans if s.trace_id == tid), tid)
                    db.add(Trace(id=tid, session_id=sess_id, status="running"))

            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()

            # Bulk create spans
            span_models = [
                Span(
                    id=s.id,
                    trace_id=s.trace_id,
                    session_id=s.session_id,
                    parent_span_id=s.parent_span_id,
                    name=s.name,
                    span_type=s.span_type,
                    start_time=s.start_time,
                    end_time=s.end_time,
                    duration_ms=s.duration_ms,
                    input_data=json.dumps(s.input_data, ensure_ascii=False) if s.input_data is not None else None,
                    output_data=json.dumps(s.output_data, ensure_ascii=False) if s.output_data is not None else None,
                    metadata_json=json.dumps(s.metadata, ensure_ascii=False) if s.metadata is not None else None,
                    status=s.status,
                )
                for s in payload.spans
            ]
            db.add_all(span_models)
            await db.commit()

            # Update trace and session statuses based on span states.
            # Tool-call errors are retryable and do NOT mark the trace as failed;
            # only blocking errors (pipeline crash, unrecoverable exception) should.
            # Trace status is purely "running" vs "ok" based on span completion.
            affected_trace_ids = list({s.trace_id for s in payload.spans})
            for tid in affected_trace_ids:
                spans_result = await db.execute(
                    select(Span.end_time).where(Span.trace_id == tid)
                )
                all_end_times = [row[0] for row in spans_result.all()]
                if not all_end_times:
                    continue
                running = any(et is None for et in all_end_times)
                trace_result = await db.execute(
                    select(Trace).where(Trace.id == tid)
                )
                trace = trace_result.scalar_one_or_none()
                if trace:
                    trace.status = "running" if running else "ok"
            await db.commit()

            # Update session statuses
            affected_session_ids = list({s.session_id for s in payload.spans})
            for sid in affected_session_ids:
                traces_result = await db.execute(
                    select(Trace.status).where(Trace.session_id == sid)
                )
                trace_statuses = [row[0] for row in traces_result.all()]
                if not trace_statuses:
                    continue
                if any(ts == "running" for ts in trace_statuses):
                    session_status = "running"
                else:
                    session_status = "ok"
                session_result = await db.execute(
                    select(Session).where(Session.id == sid)
                )
                session = session_result.scalar_one_or_none()
                if session:
                    session.status = session_status
            await db.commit()

            await event_bus.publish({
                "type": "span_batch",
                "trace_id": payload.spans[0].trace_id if payload.spans else None,
                "count": len(payload.spans),
            })
        except Exception:
            logger.exception("Background span batch persist failed (%d spans)", len(payload.spans))


async def _existing_ids(db: AsyncSession, model, ids: list[str]) -> set[str]:
    """Return the subset of ids that already exist in the database."""
    if not ids:
        return set()
    result = await db.execute(select(model.id).where(model.id.in_(ids)))
    return {row[0] for row in result.fetchall()}

@router.get("/trace/{trace_id}", response_model=list[schemas.SpanOut])
async def get_spans_by_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Span).where(Span.trace_id == trace_id).order_by(Span.start_time)
    )
    spans = result.scalars().all()
    return [_serialize_span(s) for s in spans]


@router.get("/{span_id}", response_model=schemas.SpanOut)
async def get_span(span_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Span).where(Span.id == span_id)
    )
    span = result.scalar_one_or_none()
    if not span:
        raise HTTPException(status_code=404, detail="Span not found")
    return _serialize_span(span)

