import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, Text, ForeignKey, Index

# PostgreSQL requires timezone-aware DateTime for offset-aware datetimes
UtcDateTime = lambda **kw: DateTime(timezone=True, **kw)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow, onupdate=utcnow)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    traces: Mapped[list["Trace"]] = relationship("Trace", back_populates="session", cascade="all, delete-orphan")

class Trace(Base):
    __tablename__ = "traces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")
    start_time: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    end_time: Mapped[Optional[datetime]] = mapped_column(UtcDateTime(), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    session: Mapped["Session"] = relationship("Session", back_populates="traces")
    spans: Mapped[list["Span"]] = relationship("Span", back_populates="trace", cascade="all, delete-orphan")

class Span(Base):
    __tablename__ = "spans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    trace_id: Mapped[str] = mapped_column(String(36), ForeignKey("traces.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    parent_span_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("spans.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    span_type: Mapped[str] = mapped_column(String(50))
    start_time: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    end_time: Mapped[Optional[datetime]] = mapped_column(UtcDateTime(), nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(nullable=True)
    input_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ok")

    trace: Mapped["Trace"] = relationship("Trace", back_populates="spans")
    parent: Mapped[Optional["Span"]] = relationship("Span", remote_side=[id], back_populates="children")
    children: Mapped[list["Span"]] = relationship("Span", back_populates="parent")
    logs: Mapped[list["Log"]] = relationship("Log", back_populates="span", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_spans_trace_id_start_time", "trace_id", "start_time"),
    )

class Log(Base):
    __tablename__ = "logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    trace_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("traces.id", ondelete="CASCADE"), nullable=True, index=True)
    span_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("spans.id", ondelete="CASCADE"), nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow, index=True)
    level: Mapped[str] = mapped_column(String(10))
    logger: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    thread: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    exception: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    session: Mapped["Session"] = relationship("Session")
    trace: Mapped[Optional["Trace"]] = relationship("Trace")
    span: Mapped[Optional["Span"]] = relationship("Span", back_populates="logs")

    __table_args__ = (
        Index("ix_logs_session_timestamp", "session_id", "timestamp"),
        Index("ix_logs_trace_timestamp", "trace_id", "timestamp"),
        Index("ix_logs_span_timestamp", "span_id", "timestamp"),
        Index("ix_logs_level", "level"),
    )
