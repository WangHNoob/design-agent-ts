import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db, AsyncSessionLocal
from app.models import Log, Session, Trace, Span
from app.schemas import LogCreate, LogOut, BatchLogIn
from app.events import event_bus

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/batch", status_code=202)
async def create_logs_batch(
    batch: BatchLogIn,
    background_tasks: BackgroundTasks,
):
    """Receive log batch and return immediately. DB writes are deferred to background."""
    if not batch.logs:
        return {"status": "accepted", "count": 0}
    background_tasks.add_task(_persist_logs, batch)
    return {"status": "accepted", "count": len(batch.logs)}


async def _persist_logs(batch: BatchLogIn):
    """Background task: persist log batch with its own DB session."""
    async with AsyncSessionLocal() as db:
        try:
            session_ids = list({
                log.session_id for log in batch.logs
                if log.session_id and log.session_id != "unknown"
            })

            if session_ids:
                existing = await _existing_ids(db, Session, session_ids)
                for sid in session_ids:
                    if sid not in existing:
                        db.add(Session(id=sid))
                        try:
                            await db.flush()
                        except IntegrityError:
                            await db.rollback()

            log_models = [
                Log(
                    id=log_data.id,
                    session_id=log_data.session_id,
                    trace_id=log_data.trace_id,
                    span_id=log_data.span_id,
                    timestamp=log_data.timestamp or datetime.now(timezone.utc),
                    level=log_data.level,
                    logger=log_data.logger,
                    message=log_data.message,
                    thread=log_data.thread,
                    exception=log_data.exception,
                    metadata_json=json.dumps(log_data.metadata) if log_data.metadata else None,
                )
                for log_data in batch.logs
            ]

            db.add_all(log_models)
            await db.commit()

            await event_bus.publish({
                "type": "log_batch",
                "data": {
                    "count": len(log_models),
                    "session_id": batch.logs[0].session_id if batch.logs else None,
                },
            })
        except Exception:
            logger.exception("Background log batch persist failed (%d logs)", len(batch.logs))


async def _existing_ids(db: AsyncSession, model, ids: list[str]) -> set[str]:
    """Return the subset of ids that already exist in the database."""
    if not ids:
        return set()
    result = await db.execute(select(model.id).where(model.id.in_(ids)))
    return {row[0] for row in result.fetchall()}

@router.get("/session/{session_id}", response_model=list[LogOut])
async def get_session_logs(
    session_id: str,
    level: Optional[str] = Query(None, pattern="^(DEBUG|INFO|WARN|ERROR)$"),
    logger: Optional[str] = None,
    search: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = Query(500, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """查询会话日志（支持过滤）"""
    query = select(Log).where(Log.session_id == session_id)

    if level:
        query = query.where(Log.level == level)

    if logger:
        query = query.where(Log.logger.like(f"%{logger}%"))

    if search:
        query = query.where(Log.message.like(f"%{search}%"))

    if start_time:
        query = query.where(Log.timestamp >= start_time)

    if end_time:
        query = query.where(Log.timestamp <= end_time)

    query = query.order_by(Log.timestamp.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    return [_log_to_out(log) for log in logs]

@router.get("/trace/{trace_id}", response_model=list[LogOut])
async def get_trace_logs(
    trace_id: str,
    db: AsyncSession = Depends(get_db)
):
    """查询 trace 关联日志"""
    query = select(Log).where(Log.trace_id == trace_id).order_by(Log.timestamp)
    result = await db.execute(query)
    logs = result.scalars().all()

    return [_log_to_out(log) for log in logs]

@router.get("/span/{span_id}", response_model=list[LogOut])
async def get_span_logs(
    span_id: str,
    db: AsyncSession = Depends(get_db)
):
    """查询 span 关联日志"""
    query = select(Log).where(Log.span_id == span_id).order_by(Log.timestamp)
    result = await db.execute(query)
    logs = result.scalars().all()

    return [_log_to_out(log) for log in logs]

def _log_to_out(log: Log) -> LogOut:
    """Convert Log model to LogOut schema"""
    metadata = json.loads(log.metadata_json) if log.metadata_json else None
    return LogOut(
        id=log.id,
        session_id=log.session_id,
        trace_id=log.trace_id,
        span_id=log.span_id,
        timestamp=log.timestamp,
        level=log.level,
        logger=log.logger,
        message=log.message,
        thread=log.thread,
        exception=log.exception,
        metadata=metadata
    )
