from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field

class SpanCreate(BaseModel):
    id: Optional[str] = None
    trace_id: str
    session_id: str
    parent_span_id: Optional[str] = None
    name: str
    span_type: str = Field(..., pattern="^(LLM|TOOL|RETRIEVER|AGENT_CHAIN|PIPELINE|STEP|HITL|REQUEST|FORMAT|DIRECTOR|SUB_AGENT|INTEGRATOR|ROUTER|TASK_PLANNER|HUMAN_REVIEW|SKILL_WORKFLOW)$")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    input_data: Optional[Any] = None
    output_data: Optional[Any] = None
    metadata: Optional[dict] = None
    status: str = "ok"

class SpanOut(BaseModel):
    id: str
    trace_id: str
    session_id: str
    parent_span_id: Optional[str]
    name: str
    span_type: str
    start_time: datetime
    end_time: Optional[datetime]
    duration_ms: Optional[int]
    input_data: Optional[Any]
    output_data: Optional[Any]
    metadata: Optional[dict]
    status: str
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}

class TraceStats(BaseModel):
    span_count: int = 0
    error_count: int = 0
    llm_call_count: int = 0
    tool_call_count: int = 0

class TraceCreate(BaseModel):
    id: Optional[str] = None
    session_id: str
    name: Optional[str] = None
    status: str = "running"
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    metadata: Optional[dict] = None

class TraceOut(BaseModel):
    id: str
    session_id: str
    name: Optional[str]
    status: str
    start_time: datetime
    end_time: Optional[datetime]
    duration_ms: Optional[int]
    metadata: Optional[dict]
    spans: list[SpanOut] = []
    stats: Optional[TraceStats] = None

    model_config = {"from_attributes": True}

class SessionCreate(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    metadata: Optional[dict] = None

class AgentBreakdown(BaseModel):
    agent_id: str
    llm_calls: int = 0
    tool_calls: int = 0
    tokens: int = 0
    duration_ms: int = 0

class SessionMetrics(BaseModel):
    session_id: str
    trace_count: int = 0
    total_spans: int = 0
    total_llm_calls: int = 0
    total_tool_calls: int = 0
    total_errors: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    avg_trace_duration_ms: int = 0
    p95_trace_duration_ms: int = 0
    agent_breakdown: list[AgentBreakdown] = []
    timeline: list[dict] = []

class SessionOut(BaseModel):
    id: str
    name: Optional[str]
    status: str = "running"
    created_at: datetime
    updated_at: datetime
    metadata: Optional[dict]
    traces: list[TraceOut] = []

    model_config = {"from_attributes": True}

class BatchSpanIn(BaseModel):
    spans: list[SpanCreate]

class LogCreate(BaseModel):
    id: Optional[str] = None
    session_id: str
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    level: str = Field(..., pattern="^(DEBUG|INFO|WARN|ERROR)$")
    logger: str
    message: str
    thread: Optional[str] = None
    exception: Optional[str] = None
    metadata: Optional[dict] = None

class LogOut(BaseModel):
    id: str
    session_id: str
    trace_id: Optional[str]
    span_id: Optional[str]
    timestamp: datetime
    level: str
    logger: str
    message: str
    thread: Optional[str]
    exception: Optional[str]
    metadata: Optional[dict]

    model_config = {"from_attributes": True}

class BatchLogIn(BaseModel):
    logs: list[LogCreate]

# ── Runtime Status ──────────────────────────────────────────────

class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class RuntimeStatusCreate(BaseModel):
    session_id: str
    trace_id: str
    timestamp: Optional[datetime] = None
    current_phase: str = Field(..., pattern="^(PLANNING|PIPELINE|AGENT|LLM|HITL_WAIT|INTEGRATING|COMPLETE)$")
    progress_pct: int = Field(default=0, ge=0, le=100)
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    step_description: str = ""
    context_used_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    context_compressed: bool = False
    compressed_from: Optional[int] = None
    compressed_to: Optional[int] = None
    token_usage: Optional[TokenUsage] = None
