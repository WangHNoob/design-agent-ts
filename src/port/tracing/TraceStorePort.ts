import type {
  SpanRecord,
  TraceDetail,
  TraceRecord,
  TraceSessionRecord,
} from "./types.js";

export interface EnsureTraceSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
}

export interface CreateTraceInput {
  readonly id: string;
  readonly userId: string;
  readonly traceSessionId: string;
  readonly sessionId: string;
  readonly executionId?: string;
  readonly name: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
}

export interface EndTraceInput {
  readonly status: TraceRecord["status"];
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly endedAt: string;
}

/**
 * Persistent store for Session / Trace / Span.
 * Span appends are write-once (immutable after insert).
 */
export interface TraceStorePort {
  ensureSession(input: EnsureTraceSessionInput): Promise<TraceSessionRecord>;
  createTrace(input: CreateTraceInput): Promise<TraceRecord>;
  appendSpan(span: SpanRecord): Promise<void>;
  endTrace(userId: string, traceId: string, input: EndTraceInput): Promise<TraceRecord | null>;
  getTrace(userId: string, traceId: string): Promise<TraceDetail | null>;
  listSpans(userId: string, traceId: string): Promise<SpanRecord[]>;
}
