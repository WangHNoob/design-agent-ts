const BASE_URL = process.env.NEXT_PUBLIC_O11Y_API_BASE || "http://localhost:3003";

export interface Span {
  id: string;
  trace_id: string;
  session_id: string;
  parent_span_id: string | null;
  name: string;
  span_type: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  input_data: any;
  output_data: any;
  metadata: any;
  status: string;
  error_message: string | null;
  children?: Span[];
}

export interface TraceStats {
  span_count: number;
  error_count: number;
  llm_call_count: number;
  tool_call_count: number;
}

export interface Trace {
  id: string;
  session_id: string;
  name: string | null;
  status: string;
  start_time: string;
  end_time: string | null;
  duration_ms: number | null;
  metadata: any;
  spans: Span[];
  stats: TraceStats | null;
}

export interface Log {
  id: string;
  session_id: string;
  trace_id: string | null;
  span_id: string | null;
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  thread: string | null;
  exception: string | null;
  metadata: any;
}

export interface Session {
  id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
  metadata: any;
  traces: Trace[];
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AgentBreakdown {
  agent_id: string;
  llm_calls: number;
  tool_calls: number;
  tokens: number;
  duration_ms: number;
}

export interface SessionMetrics {
  session_id: string;
  trace_count: number;
  total_spans: number;
  total_llm_calls: number;
  total_tool_calls: number;
  total_errors: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  avg_trace_duration_ms: number;
  p95_trace_duration_ms: number;
  agent_breakdown: AgentBreakdown[];
  timeline: any[];
}

export interface RuntimeStatus {
  session_id: string;
  trace_id: string;
  timestamp: string;
  current_phase: string;
  progress_pct: number;
  agent_id: string | null;
  agent_name: string | null;
  step_description: string;
  context_used_pct: number;
  context_compressed: boolean;
  compressed_from: number | null;
  compressed_to: number | null;
  token_usage: TokenUsage | null;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `API error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  listSessions: () => api<Session[]>("/api/v1/sessions"),
  getSession: (id: string) => api<Session>(`/api/v1/sessions/${id}`),
  createSession: (data: any) => api<Session>("/api/v1/sessions", { method: "POST", body: JSON.stringify(data) }),
  getTracesBySession: (sessionId: string) => api<Trace[]>(`/api/v1/traces/session/${sessionId}`),
  getTrace: (id: string) => api<Trace>(`/api/v1/traces/${id}`),
  getSpansByTrace: (traceId: string) => api<Span[]>(`/api/v1/spans/trace/${traceId}`),
  deleteSession: (sessionId: string) => api<void>(`/api/v1/sessions/${sessionId}`, { method: "DELETE" }),
  getLogsBySpan: (spanId: string) => api<Log[]>(`/api/v1/logs/span/${spanId}`),
  getLogsByTrace: (traceId: string) => api<Log[]>(`/api/v1/logs/trace/${traceId}`),
  getSessionMetrics: (sessionId: string) => api<SessionMetrics>(`/api/v1/sessions/${sessionId}/metrics`),
};
