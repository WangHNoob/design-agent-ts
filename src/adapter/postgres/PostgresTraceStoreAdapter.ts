import type { DatabasePort, DbRow } from "../../port/infra/DatabasePort.js";
import type {
  CreateTraceInput,
  EndTraceInput,
  EnsureTraceSessionInput,
  TraceStorePort,
} from "../../port/tracing/TraceStorePort.js";
import type {
  SpanKind,
  SpanPhase,
  SpanRecord,
  SpanStatus,
  TraceDetail,
  TraceRecord,
  TraceSessionRecord,
} from "../../port/tracing/types.js";

/**
 * Postgres-backed TraceStore. Spans are INSERT-only (immutable).
 */
export class PostgresTraceStoreAdapter implements TraceStorePort {
  constructor(private readonly db: DatabasePort) {}

  async ensureSession(input: EnsureTraceSessionInput): Promise<TraceSessionRecord> {
    const result = await this.db.query(
      `INSERT INTO agent_trace_sessions (id, user_id, session_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, session_id)
       DO UPDATE SET session_id = EXCLUDED.session_id
       RETURNING *`,
      { 1: input.id, 2: input.userId, 3: input.sessionId },
    );
    return this.rowToSession(this.requireRow(result.rows[0]));
  }

  async createTrace(input: CreateTraceInput): Promise<TraceRecord> {
    const result = await this.db.query(
      `INSERT INTO agent_traces (
         id, user_id, trace_session_id, session_id, execution_id,
         name, status, attributes, started_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'unset', $7, $8, $8)
       RETURNING *`,
      {
        1: input.id,
        2: input.userId,
        3: input.traceSessionId,
        4: input.sessionId,
        5: input.executionId ?? null,
        6: input.name,
        7: input.attributes ?? {},
        8: input.startedAt,
      },
    );
    return this.rowToTrace(this.requireRow(result.rows[0]));
  }

  async appendSpan(span: SpanRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO agent_spans (
         id, user_id, trace_id, parent_span_id, name, phase, kind, status,
         attributes, started_at, ended_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      {
        1: span.id,
        2: span.userId,
        3: span.traceId,
        4: span.parentSpanId ?? null,
        5: span.name,
        6: span.phase ?? null,
        7: span.kind,
        8: span.status,
        9: span.attributes,
        10: span.startedAt,
        11: span.endedAt,
        12: span.createdAt,
      },
    );
  }

  async endTrace(userId: string, traceId: string, input: EndTraceInput): Promise<TraceRecord | null> {
    const result = await this.db.query(
      `UPDATE agent_traces
       SET status = $1,
           attributes = COALESCE(attributes, '{}'::jsonb) || $2::jsonb,
           ended_at = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      {
        1: input.status,
        2: input.attributes ?? {},
        3: input.endedAt,
        4: traceId,
        5: userId,
      },
    );
    return result.rows[0] ? this.rowToTrace(result.rows[0]) : null;
  }

  async getTrace(userId: string, traceId: string): Promise<TraceDetail | null> {
    const traceResult = await this.db.query(
      `SELECT * FROM agent_traces WHERE id = $1 AND user_id = $2`,
      { 1: traceId, 2: userId },
    );
    const traceRow = traceResult.rows[0];
    if (!traceRow) return null;
    const trace = this.rowToTrace(traceRow);

    const sessionResult = await this.db.query(
      `SELECT * FROM agent_trace_sessions WHERE id = $1 AND user_id = $2`,
      { 1: trace.traceSessionId, 2: userId },
    );
    const sessionRow = sessionResult.rows[0];
    if (!sessionRow) return null;

    const spans = await this.listSpans(userId, traceId);
    return {
      session: this.rowToSession(sessionRow),
      trace,
      spans,
    };
  }

  async listSpans(userId: string, traceId: string): Promise<SpanRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM agent_spans
       WHERE trace_id = $1 AND user_id = $2
       ORDER BY started_at ASC, created_at ASC`,
      { 1: traceId, 2: userId },
    );
    return result.rows.map((row) => this.rowToSpan(row));
  }

  private requireRow(row: DbRow | undefined): DbRow {
    if (!row) throw new Error("Expected database row");
    return row;
  }

  private rowToSession(row: DbRow): TraceSessionRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      sessionId: row.session_id as string,
      createdAt: this.iso(row.created_at),
    };
  }

  private rowToTrace(row: DbRow): TraceRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      traceSessionId: row.trace_session_id as string,
      sessionId: row.session_id as string,
      executionId: row.execution_id ? String(row.execution_id) : undefined,
      name: row.name as string,
      status: row.status as SpanStatus,
      attributes: this.attrs(row.attributes),
      startedAt: this.iso(row.started_at),
      endedAt: row.ended_at ? this.iso(row.ended_at) : undefined,
      createdAt: this.iso(row.created_at),
    };
  }

  private rowToSpan(row: DbRow): SpanRecord {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      traceId: row.trace_id as string,
      parentSpanId: row.parent_span_id ? String(row.parent_span_id) : undefined,
      name: row.name as string,
      phase: row.phase ? (row.phase as SpanPhase) : undefined,
      kind: row.kind as SpanKind,
      status: row.status as SpanStatus,
      attributes: this.attrs(row.attributes),
      startedAt: this.iso(row.started_at),
      endedAt: this.iso(row.ended_at),
      createdAt: this.iso(row.created_at),
    };
  }

  private attrs(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private iso(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
