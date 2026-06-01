import type { TraceReporter, TraceCreate, TraceOut } from "../../port/o11y/TraceReporter.js";
import type { SpanReporter, BatchSpanIn, SpanOut } from "../../port/o11y/SpanReporter.js";
import type { LogReporter, BatchLogIn, LogOut } from "../../port/o11y/LogReporter.js";
import type { RuntimeStatusReporter, RuntimeStatusCreate } from "../../port/o11y/RuntimeStatusReporter.js";
import type { SessionReporter, SessionCreate, SessionOut, SessionMetrics } from "../../port/o11y/SessionReporter.js";

export class NoOpTraceReporter implements TraceReporter {
  async createTrace(_trace: TraceCreate): Promise<TraceOut> {
    return { id: "noop", session_id: "noop", status: "ok", start_time: new Date(), spans: [] };
  }
  async getTrace(_traceId: string): Promise<TraceOut | null> {
    return null;
  }
  async getTracesBySession(_sessionId: string): Promise<TraceOut[]> {
    return [];
  }
}

export class NoOpSpanReporter implements SpanReporter {
  async batchCreateSpans(batch: BatchSpanIn): Promise<{ received: number }> {
    return { received: batch.spans.length };
  }
  async getSpansByTrace(_traceId: string): Promise<SpanOut[]> {
    return [];
  }
}

export class NoOpLogReporter implements LogReporter {
  async batchCreateLogs(batch: BatchLogIn): Promise<{ status: string; count: number }> {
    return { status: "accepted", count: batch.logs.length };
  }
  async getLogsBySession(_sessionId: string, _options?: { level?: string; limit?: number; offset?: number }): Promise<LogOut[]> {
    return [];
  }
}

export class NoOpRuntimeStatusReporter implements RuntimeStatusReporter {
  async postRuntimeStatus(_status: RuntimeStatusCreate): Promise<{ status: string }> {
    return { status: "accepted" };
  }
}

export class NoOpSessionReporter implements SessionReporter {
  async createSession(_session: SessionCreate): Promise<SessionOut> {
    return { id: "noop", status: "ok", created_at: new Date(), updated_at: new Date(), traces: [] };
  }
  async getSession(_sessionId: string): Promise<SessionOut | null> {
    return null;
  }
  async listSessions(_options?: { skip?: number; limit?: number }): Promise<SessionOut[]> {
    return [];
  }
  async getSessionMetrics(_sessionId: string): Promise<SessionMetrics | null> {
    return null;
  }
}
