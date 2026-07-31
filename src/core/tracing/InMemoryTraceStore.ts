import type {
  CreateTraceInput,
  EndTraceInput,
  EnsureTraceSessionInput,
  TraceStorePort,
} from "../../port/tracing/TraceStorePort.js";
import type {
  SpanRecord,
  TraceDetail,
  TraceRecord,
  TraceSessionRecord,
} from "../../port/tracing/types.js";

/**
 * In-memory TraceStore for unit tests and local runs without Postgres.
 * Span appends are write-once (rejects duplicates).
 */
export class InMemoryTraceStore implements TraceStorePort {
  private readonly sessions = new Map<string, TraceSessionRecord>();
  private readonly sessionByUserSession = new Map<string, string>();
  private readonly traces = new Map<string, TraceRecord>();
  private readonly spans = new Map<string, SpanRecord[]>();
  private readonly spanIds = new Set<string>();

  async ensureSession(input: EnsureTraceSessionInput): Promise<TraceSessionRecord> {
    const key = `${input.userId}:${input.sessionId}`;
    const existingId = this.sessionByUserSession.get(key);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) return existing;
    }
    const record: TraceSessionRecord = {
      id: input.id,
      userId: input.userId,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(record.id, record);
    this.sessionByUserSession.set(key, record.id);
    return record;
  }

  async createTrace(input: CreateTraceInput): Promise<TraceRecord> {
    const now = input.startedAt;
    const record: TraceRecord = {
      id: input.id,
      userId: input.userId,
      traceSessionId: input.traceSessionId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      name: input.name,
      status: "unset",
      attributes: { ...(input.attributes ?? {}) },
      startedAt: now,
      createdAt: now,
    };
    this.traces.set(record.id, record);
    this.spans.set(record.id, []);
    return record;
  }

  async appendSpan(span: SpanRecord): Promise<void> {
    if (this.spanIds.has(span.id)) {
      throw new Error(`Span ${span.id} is immutable and already exists`);
    }
    const list = this.spans.get(span.traceId);
    if (!list) {
      throw new Error(`Trace ${span.traceId} not found`);
    }
    this.spanIds.add(span.id);
    list.push(span);
  }

  async endTrace(userId: string, traceId: string, input: EndTraceInput): Promise<TraceRecord | null> {
    const existing = this.traces.get(traceId);
    if (!existing || existing.userId !== userId) return null;
    const updated: TraceRecord = {
      ...existing,
      status: input.status,
      attributes: { ...existing.attributes, ...(input.attributes ?? {}) },
      endedAt: input.endedAt,
    };
    this.traces.set(traceId, updated);
    return updated;
  }

  async getTrace(userId: string, traceId: string): Promise<TraceDetail | null> {
    const trace = this.traces.get(traceId);
    if (!trace || trace.userId !== userId) return null;
    const session = this.sessions.get(trace.traceSessionId);
    if (!session) return null;
    return {
      session,
      trace,
      spans: [...(this.spans.get(traceId) ?? [])],
    };
  }

  async listSpans(userId: string, traceId: string): Promise<SpanRecord[]> {
    const detail = await this.getTrace(userId, traceId);
    return detail ? [...detail.spans] : [];
  }
}
