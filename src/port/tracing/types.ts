/**
 * Nine ReAct-aligned span phases (plan A1).
 * Matches HookPoint minus on_iteration_budget; plus post_summary.
 */
export const NINE_SPAN_PHASES = [
  "pre_reasoning",
  "post_reasoning",
  "pre_tool_execution",
  "post_tool_execution",
  "pre_summary",
  "post_summary",
  "pre_agent_call",
  "post_agent_call",
  "on_error",
] as const;

export type SpanPhase = (typeof NINE_SPAN_PHASES)[number];

export type SpanKind = "internal" | "client" | "server";

export type SpanStatus = "ok" | "error" | "unset";

export interface TraceSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly createdAt: string;
}

export interface TraceRecord {
  readonly id: string;
  readonly userId: string;
  readonly traceSessionId: string;
  readonly sessionId: string;
  readonly executionId?: string;
  readonly name: string;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly createdAt: string;
}

/**
 * Immutable span once written. Callers must not mutate after append.
 */
export interface SpanRecord {
  readonly id: string;
  readonly userId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly phase?: SpanPhase;
  readonly kind: SpanKind;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly createdAt: string;
}

export interface TraceDetail {
  readonly session: TraceSessionRecord;
  readonly trace: TraceRecord;
  readonly spans: readonly SpanRecord[];
}

export function isSpanPhase(value: string): value is SpanPhase {
  return (NINE_SPAN_PHASES as readonly string[]).includes(value);
}
