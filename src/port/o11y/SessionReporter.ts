import type { TraceOut } from "./TraceReporter.js";

export interface SessionCreate {
  id?: string;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SessionOut {
  id: string;
  name?: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, unknown> | null;
  traces: TraceOut[];
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
  timeline: Record<string, unknown>[];
}

export interface SessionReporter {
  createSession(session: SessionCreate): Promise<SessionOut>;
  getSession(sessionId: string): Promise<SessionOut | null>;
  listSessions(options?: { skip?: number; limit?: number }): Promise<SessionOut[]>;
  getSessionMetrics(sessionId: string): Promise<SessionMetrics | null>;
}

export type { TraceOut };
