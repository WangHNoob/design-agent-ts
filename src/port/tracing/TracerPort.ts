export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly kind: "internal" | "client" | "server";
  readonly startTime: number;
  readonly endTime?: number;
  readonly attributes: Record<string, unknown>;
  readonly status: "ok" | "error" | "unset";
}

export interface TracerPort {
  startSpan(name: string, parent?: SpanContext): SpanContext;
  endSpan(span: SpanContext): void;
  getCurrentSpan(): SpanContext | null;
}
