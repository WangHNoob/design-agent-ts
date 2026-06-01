import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

export type SpanType =
  | "LLM"
  | "TOOL"
  | "RETRIEVER"
  | "AGENT_CHAIN"
  | "PIPELINE"
  | "STEP"
  | "HITL"
  | "REQUEST"
  | "FORMAT"
  | "DIRECTOR"
  | "SUB_AGENT"
  | "INTEGRATOR"
  | "ROUTER"
  | "TASK_PLANNER"
  | "HUMAN_REVIEW"
  | "SKILL_WORKFLOW";

export interface O11ySpan {
  id: string;
  traceId: string;
  sessionId: string;
  parentSpanId?: string | null;
  name: string;
  spanType: SpanType;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  inputData?: Record<string, unknown> | null;
  outputData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status: "ok" | "error" | "unset";
}

let idGenerator: IdGeneratorPort | null = null;

export function configureIdGenerator(generator: IdGeneratorPort): void {
  idGenerator = generator;
}

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createSpan(
  traceId: string,
  sessionId: string,
  name: string,
  spanType: SpanType,
  parentSpanId?: string | null,
  inputData?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null
): O11ySpan {
  return {
    id: idGenerator?.randomUUID() ?? fallbackUUID(),
    traceId,
    sessionId,
    parentSpanId: parentSpanId ?? null,
    name,
    spanType,
    startTime: new Date(),
    inputData: inputData ?? null,
    metadata: metadata ?? null,
    status: "unset",
  };
}

export function endSpan(span: O11ySpan, outputData?: Record<string, unknown> | null): O11ySpan {
  const endTime = new Date();
  return {
    ...span,
    endTime,
    durationMs: endTime.getTime() - span.startTime.getTime(),
    outputData: outputData ?? null,
    status: span.status === "unset" ? "ok" : span.status,
  };
}

export function failSpan(span: O11ySpan, errorMessage: string): O11ySpan {
  const endTime = new Date();
  return {
    ...span,
    endTime,
    durationMs: endTime.getTime() - span.startTime.getTime(),
    outputData: { error_message: errorMessage },
    status: "error",
  };
}
