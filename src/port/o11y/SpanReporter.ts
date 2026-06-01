import type { SpanOut } from "./TraceReporter.js";

export interface SpanCreate {
  id?: string;
  trace_id: string;
  session_id: string;
  parent_span_id?: string | null;
  name: string;
  span_type: string;
  start_time?: Date;
  end_time?: Date;
  duration_ms?: number;
  input_data?: Record<string, unknown> | null;
  output_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status?: string;
}

export interface BatchSpanIn {
  spans: SpanCreate[];
}

export interface SpanReporter {
  batchCreateSpans(batch: BatchSpanIn): Promise<{ received: number }>;
  getSpansByTrace(traceId: string): Promise<SpanOut[]>;
}

export type { SpanOut };
