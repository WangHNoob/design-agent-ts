import type { SpanReporter, SpanCreate } from "../../port/o11y/SpanReporter.js";
import type { TraceReporter, TraceCreate, TraceOut } from "../../port/o11y/TraceReporter.js";
import {
  createSpan,
  endSpan as endSpanFn,
  failSpan as failSpanFn,
  type O11ySpan,
  type SpanType,
} from "./O11ySpan.js";
import { getCurrentContext, type O11yContext } from "./O11yContext.js";

let spanReporter: SpanReporter | null = null;
let traceReporter: TraceReporter | null = null;

export function setSpanReporter(reporter: SpanReporter | null): void {
  spanReporter = reporter;
}

export function setTraceReporter(reporter: TraceReporter | null): void {
  traceReporter = reporter;
}

export function startSpan(
  name: string,
  spanType: SpanType,
  parentCtx?: O11yContext | null,
  inputData?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null
): O11ySpan {
  const ctx = parentCtx ?? getCurrentContext();
  if (!ctx) {
    throw new Error("No O11y context available. Call startSpan within a traced context or provide parentCtx.");
  }
  return createSpan(ctx.traceId, ctx.sessionId, name, spanType, ctx.spanId, inputData, metadata);
}

export function endSpan(span: O11ySpan, outputData?: Record<string, unknown> | null): void {
  const completed = endSpanFn(span, outputData);
  reportSpan(completed);
}

export function failSpan(span: O11ySpan, errorMessage: string): void {
  const completed = failSpanFn(span, errorMessage);
  reportSpan(completed);
}

export async function createTrace(trace: TraceCreate): Promise<TraceOut | null> {
  if (!traceReporter) return null;
  try {
    return await traceReporter.createTrace(trace);
  } catch {
    return null;
  }
}

function reportSpan(span: O11ySpan): void {
  if (!spanReporter) return;
  const dto: SpanCreate = {
    id: span.id,
    trace_id: span.traceId,
    session_id: span.sessionId,
    parent_span_id: span.parentSpanId,
    name: span.name,
    span_type: span.spanType,
    start_time: span.startTime,
    end_time: span.endTime,
    duration_ms: span.durationMs,
    input_data: span.inputData,
    output_data: span.outputData,
    metadata: span.metadata,
    status: span.status,
  };
  spanReporter.batchCreateSpans({ spans: [dto] }).catch(() => {});
}

export { createSpan, endSpanFn as endSpanRaw, failSpanFn as failSpanRaw, type O11ySpan, type SpanType };
