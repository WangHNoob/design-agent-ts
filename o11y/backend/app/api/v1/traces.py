import json
from datetime import timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app import schemas
from app.models import Trace, Span
from app.events import event_bus

router = APIRouter(tags=["traces"])

def _utc(dt):
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

def _compute_trace_stats(spans) -> dict:
    llm_calls = 0
    tool_calls = 0
    error_count = 0

    for s in spans:
        span_type = s.get("span_type") if isinstance(s, dict) else getattr(s, "span_type", None)
        if span_type == "LLM":
            llm_calls += 1
        elif span_type == "TOOL":
            tool_calls += 1

        status = s.get("status") if isinstance(s, dict) else getattr(s, "status", None)
        if status == "error":
            error_count += 1

    return {
        "span_count": len(spans),
        "error_count": error_count,
        "llm_call_count": llm_calls,
        "tool_call_count": tool_calls,
    }

def _serialize_trace(trace, include_spans=False, include_stats=False):
    t = {
        "id": trace.id,
        "session_id": trace.session_id,
        "name": trace.name,
        "status": trace.status,
        "start_time": _utc(trace.start_time),
        "end_time": _utc(trace.end_time),
        "duration_ms": trace.duration_ms,
        "metadata": json.loads(trace.metadata_json) if trace.metadata_json else None,
        "spans": [],
        "stats": None,
    }
    if include_spans:
        serialized_spans = [_serialize_span(s) for s in trace.spans]
        t["spans"] = serialized_spans
        if include_stats:
            t["stats"] = _compute_trace_stats(serialized_spans)
    return t

@router.post("", response_model=schemas.TraceOut)
async def create_trace(
    trace_in: schemas.TraceCreate,
    db: AsyncSession = Depends(get_db),
):
    from app.models import Session as SessionModel
    # Auto-create session if it does not exist (idempotent)
    session_result = await db.execute(
        select(SessionModel).where(SessionModel.id == trace_in.session_id)
    )
    if not session_result.scalar_one_or_none():
        db.add(SessionModel(id=trace_in.session_id, name=trace_in.session_id[:8]))
        try:
            await db.flush()
        except Exception:
            await db.rollback()

    db_trace = Trace(
        id=trace_in.id,
        session_id=trace_in.session_id,
        name=trace_in.name,
        status=trace_in.status,
        start_time=trace_in.start_time,
        end_time=trace_in.end_time,
        duration_ms=trace_in.duration_ms,
        metadata_json=json.dumps(trace_in.metadata, ensure_ascii=False) if trace_in.metadata else None,
    )
    db.add(db_trace)
    await db.commit()
    await db.refresh(db_trace)
    await event_bus.publish({
        "type": "trace",
        "trace_id": db_trace.id,
        "session_id": db_trace.session_id,
    })
    return _serialize_trace(db_trace)

@router.get("/session/{session_id}", response_model=list[schemas.TraceOut])
async def get_traces_by_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Trace)
        .where(Trace.session_id == session_id)
        .options(selectinload(Trace.spans))
        .order_by(desc(Trace.start_time))
    )
    traces = result.scalars().all()
    return [_serialize_trace(t, include_spans=True, include_stats=True) for t in traces]


@router.get("/{trace_id}", response_model=schemas.TraceOut)
async def get_trace(
    trace_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Trace)
        .where(Trace.id == trace_id)
        .options(selectinload(Trace.spans))
    )
    trace = result.scalar_one_or_none()
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return _serialize_trace(trace, include_spans=True, include_stats=True)

