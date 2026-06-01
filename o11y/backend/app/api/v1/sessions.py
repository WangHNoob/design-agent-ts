import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app import schemas
from app.models import Session, Trace, Span, Log
from app.events import event_bus

router = APIRouter(tags=["sessions"])

TTL_HOURS = 72  # Auto-delete sessions older than 72 hours

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

def _serialize_session(session, include_traces=False, include_spans=False):
    s = {
        "id": session.id,
        "name": session.name,
        "status": getattr(session, "status", "running"),
        "created_at": _utc(session.created_at),
        "updated_at": _utc(session.updated_at),
        "metadata": json.loads(session.metadata_json) if session.metadata_json else None,
        "traces": [],
    }
    if include_traces:
        s["traces"] = [_serialize_trace(t, include_spans=include_spans, include_stats=include_spans) for t in session.traces]
    return s

@router.post("", response_model=schemas.SessionOut)
async def create_session(
    session_in: schemas.SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    db_session = Session(
        id=session_in.id,
        name=session_in.name,
        metadata_json=json.dumps(session_in.metadata, ensure_ascii=False) if session_in.metadata else None,
    )
    db.add(db_session)
    await db.commit()
    await db.refresh(db_session)
    await event_bus.publish({
        "type": "session",
        "session_id": db_session.id,
    })
    return _serialize_session(db_session)

@router.get("/{session_id}/metrics", response_model=schemas.SessionMetrics)
async def get_session_metrics(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Aggregate metrics for a session across all its traces and spans."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.traces).selectinload(Trace.spans))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    total_spans = 0
    total_llm_calls = 0
    total_tool_calls = 0
    total_errors = 0
    total_prompt_tokens = 0
    total_completion_tokens = 0
    estimated_cost = 0.0
    trace_durations: list[int] = []

    # Agent breakdown accumulator
    agent_stats: dict[str, dict] = {}

    for trace in session.traces:
        if trace.duration_ms is not None:
            trace_durations.append(trace.duration_ms)

        for span in trace.spans:
            total_spans += 1
            span_type = span.span_type
            if span_type == "LLM":
                total_llm_calls += 1
            elif span_type == "TOOL":
                total_tool_calls += 1
            if span.status == "error":
                total_errors += 1

            # Tokens & cost
            span_dict = _serialize_span(span)
            pt, ct = _extract_tokens(span_dict)
            total_prompt_tokens += pt
            total_completion_tokens += ct

            model = _detect_model(span_dict.get("metadata"), span_dict.get("input_data"))
            model_key = _model_to_cost_key(model)
            estimated_cost += _estimate_cost(pt, ct, model_key)

            # Agent breakdown
            agent_id = None
            if isinstance(span_dict.get("metadata"), dict):
                agent_id = span_dict["metadata"].get("agent_id") or span_dict["metadata"].get("agentId")
            if not agent_id and span_type in ("AGENT_CHAIN", "SUB_AGENT", "DIRECTOR"):
                agent_id = span.name
            if not agent_id:
                agent_id = "unknown"

            if agent_id not in agent_stats:
                agent_stats[agent_id] = {"llm_calls": 0, "tool_calls": 0, "tokens": 0, "duration_ms": 0}
            agent_stats[agent_id]["llm_calls"] += 1 if span_type == "LLM" else 0
            agent_stats[agent_id]["tool_calls"] += 1 if span_type == "TOOL" else 0
            agent_stats[agent_id]["tokens"] += pt + ct
            if span.duration_ms:
                agent_stats[agent_id]["duration_ms"] += span.duration_ms

    # Compute percentiles
    avg_trace_duration = 0
    p95_trace_duration = 0
    if trace_durations:
        trace_durations.sort()
        avg_trace_duration = int(sum(trace_durations) / len(trace_durations))
        p95_idx = int(len(trace_durations) * 0.95)
        p95_trace_duration = trace_durations[min(p95_idx, len(trace_durations) - 1)]

    agent_breakdown = [
        schemas.AgentBreakdown(
            agent_id=aid,
            llm_calls=stats["llm_calls"],
            tool_calls=stats["tool_calls"],
            tokens=stats["tokens"],
            duration_ms=stats["duration_ms"],
        )
        for aid, stats in sorted(agent_stats.items(), key=lambda x: -x[1]["tokens"])
    ]

    return schemas.SessionMetrics(
        session_id=session_id,
        trace_count=len(session.traces),
        total_spans=total_spans,
        total_llm_calls=total_llm_calls,
        total_tool_calls=total_tool_calls,
        total_errors=total_errors,
        total_prompt_tokens=total_prompt_tokens,
        total_completion_tokens=total_completion_tokens,
        total_tokens=total_prompt_tokens + total_completion_tokens,
        estimated_cost_usd=round(estimated_cost, 6),
        avg_trace_duration_ms=avg_trace_duration,
        p95_trace_duration_ms=p95_trace_duration,
        agent_breakdown=agent_breakdown,
        timeline=[],
    )


@router.get("", response_model=list[schemas.SessionOut])
async def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session)
        .where(Session.id != "unknown")
        .order_by(desc(Session.updated_at))
        .offset(skip)
        .limit(limit)
    )
    sessions = result.scalars().all()
    return [_serialize_session(s) for s in sessions]

@router.get("/{session_id}", response_model=schemas.SessionOut)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(selectinload(Session.traces).selectinload(Trace.spans))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _serialize_session(session, include_traces=True, include_spans=True)

@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    await event_bus.publish({
        "type": "session_deleted",
        "session_id": session_id,
    })

# ── Cost model mapping (USD per 1M tokens) ──────────────────────────────────
COST_MAP = {
    "gpt-4o": {"prompt": 2.50, "completion": 10.00},
    "gpt-4o-mini": {"prompt": 0.15, "completion": 0.60},
    "gpt-4-turbo": {"prompt": 10.00, "completion": 30.00},
    "gpt-4": {"prompt": 30.00, "completion": 60.00},
    "claude-3-5-sonnet": {"prompt": 3.00, "completion": 15.00},
    "claude-3-opus": {"prompt": 15.00, "completion": 75.00},
    "claude-3-haiku": {"prompt": 0.25, "completion": 1.25},
    "deepseek-chat": {"prompt": 0.14, "completion": 0.28},
    "deepseek-reasoner": {"prompt": 0.55, "completion": 2.19},
}

def _detect_model(metadata: dict | None, input_data: dict | None) -> str | None:
    """Try to detect model name from span metadata or input_data."""
    if isinstance(metadata, dict):
        m = metadata.get("model") or metadata.get("model_name") or metadata.get("model_id")
        if m:
            return m
    if isinstance(input_data, dict):
        m = input_data.get("model") or input_data.get("model_name")
        if m:
            return m
    return None

def _model_to_cost_key(model: str | None) -> str | None:
    if not model:
        return None
    model_l = model.lower()
    for key in COST_MAP:
        if key in model_l:
            return key
    return None

def _extract_tokens(span_dict: dict) -> tuple[int, int]:
    """Extract (prompt_tokens, completion_tokens) from a serialized span."""
    usage = None
    for source in [span_dict.get("metadata"), span_dict.get("input_data"), span_dict.get("output_data")]:
        if isinstance(source, dict) and "usage" in source:
            usage = source["usage"]
            break
        if isinstance(source, dict) and ("prompt_tokens" in source or "completion_tokens" in source):
            usage = source
            break
    if not isinstance(usage, dict):
        return (0, 0)
    prompt = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
    completion = usage.get("completion_tokens") or usage.get("output_tokens") or 0
    return (int(prompt) if prompt else 0, int(completion) if completion else 0)

def _estimate_cost(prompt_tokens: int, completion_tokens: int, model_key: str | None) -> float:
    if not model_key or model_key not in COST_MAP:
        return 0.0
    rates = COST_MAP[model_key]
    return (prompt_tokens * rates["prompt"] + completion_tokens * rates["completion"]) / 1_000_000

async def cleanup_expired_sessions(db: AsyncSession):
    """Delete sessions older than TTL_HOURS and their cascaded data."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=TTL_HOURS)
    result = await db.execute(
        delete(Session).where(Session.created_at < cutoff)
    )
    deleted = result.rowcount
    if deleted > 0:
        await db.commit()
        print(f"[TTL] Cleaned up {deleted} expired sessions (TTL={TTL_HOURS}h)")
    return deleted
