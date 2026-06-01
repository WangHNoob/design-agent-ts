import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.events import event_bus
from app.schemas import RuntimeStatusCreate

router = APIRouter()


@router.post("/status", status_code=202)
async def post_runtime_status(status: RuntimeStatusCreate):
    """Receive a runtime status snapshot from the Java SDK and broadcast via SSE."""
    from app.models import Session

    event = {
        "type": "runtime_status",
        "session_id": status.session_id,
        "trace_id": status.trace_id,
        "timestamp": (status.timestamp or datetime.now(timezone.utc)).isoformat(),
        "current_phase": status.current_phase,
        "progress_pct": status.progress_pct,
        "agent_id": status.agent_id,
        "agent_name": status.agent_name,
        "step_description": status.step_description,
        "context_used_pct": status.context_used_pct,
        "context_compressed": status.context_compressed,
        "compressed_from": status.compressed_from,
        "compressed_to": status.compressed_to,
        "token_usage": status.token_usage.model_dump() if status.token_usage else None,
    }
    await event_bus.publish(event)
    return {"status": "accepted"}


@router.get("/session/{session_id}")
async def get_latest_status(session_id: str):
    """Return the latest runtime status for a session (not implemented — SSE-only for now)."""
    return {"session_id": session_id, "status": "no_cache"}
