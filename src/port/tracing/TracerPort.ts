import type { SpanKind, SpanPhase, SpanStatus } from "./types.js";

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: SpanKind;
  readonly phase?: SpanPhase;
  readonly startTime: number;
  readonly endTime?: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly status: SpanStatus;
}

export interface TraceHandle {
  readonly traceId: string;
  readonly rootSpan: SpanContext;
}

export interface StartTraceInput {
  readonly sessionId: string;
  readonly userId: string;
  readonly name: string;
  readonly executionId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface StartSpanOptions {
  readonly parent?: SpanContext;
  readonly kind?: SpanKind;
  readonly phase?: SpanPhase;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RecordSpanInput {
  readonly name: string;
  readonly phase?: SpanPhase;
  readonly parentSpanId?: string;
  readonly kind?: SpanKind;
  readonly status?: SpanStatus;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly startTime?: number;
  readonly endTime?: number;
}

export interface TraceRuntimeState {
  readonly userId: string;
  readonly sessionId: string;
  readonly traceId: string;
  readonly stack: readonly SpanContext[];
}

/**
 * In-process tracer. Implementations persist via TraceStorePort and may
 * fan-out completed spans to TraceExporter (OTel-ready).
 */
export interface TracerPort {
  startTrace(input: StartTraceInput): Promise<TraceHandle>;
  startSpan(name: string, options?: StartSpanOptions): Promise<SpanContext>;
  endSpan(
    span: SpanContext,
    status?: SpanStatus,
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  /** Instantaneous completed span (nine-phase hook events). */
  recordSpan(input: RecordSpanInput): Promise<SpanContext>;
  endTrace(
    traceId: string,
    status?: SpanStatus,
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  getCurrentSpan(): SpanContext | null;
  getCurrentTrace(): TraceRuntimeState | null;
  withSpan<R>(span: SpanContext, callback: () => R | Promise<R>): Promise<R>;
  withTrace<R>(handle: TraceHandle, callback: () => R | Promise<R>): Promise<R>;
  /** Optional: bind ALS for streaming; returns unbind. */
  bindTrace?(handle: TraceHandle): () => void;
}
