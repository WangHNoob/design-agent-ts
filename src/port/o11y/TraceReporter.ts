export interface TraceCreate {
  id?: string;
  session_id: string;
  name?: string;
  status?: string;
  start_time?: Date;
  end_time?: Date;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export interface TraceOut {
  id: string;
  session_id: string;
  name?: string;
  status: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  metadata?: Record<string, unknown>;
  spans: SpanOut[];
  stats?: TraceStats;
}

export interface TraceStats {
  span_count: number;
  error_count: number;
  llm_call_count: number;
  tool_call_count: number;
}

export interface SpanOut {
  id: string;
  trace_id: string;
  session_id: string;
  parent_span_id?: string;
  name: string;
  span_type: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  input_data?: Record<string, unknown> | null;
  output_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  error_message?: string | null;
}

export interface TraceReporter {
  createTrace(trace: TraceCreate): Promise<TraceOut>;
  getTrace(traceId: string): Promise<TraceOut | null>;
  getTracesBySession(sessionId: string): Promise<TraceOut[]>;
}
