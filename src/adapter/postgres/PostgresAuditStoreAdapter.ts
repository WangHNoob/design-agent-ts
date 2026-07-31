import type { DatabasePort, DbRow } from "../../port/infra/DatabasePort.js";
import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { AppendAuditInput, AuditEntry, AuditListOptions, AuditOutcome } from "../../port/audit/types.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

export class PostgresAuditStoreAdapter implements AuditStorePort {
  constructor(
    private readonly db: DatabasePort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async append(input: AppendAuditInput): Promise<AuditEntry> {
    const id = this.idGenerator.randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.query(
      `INSERT INTO audit_logs (
         id, user_id, action, resource_type, resource_id,
         session_id, execution_id, trace_id, outcome, detail,
         ip, user_agent, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      {
        1: id,
        2: input.userId,
        3: input.action,
        4: input.resourceType ?? null,
        5: input.resourceId ?? null,
        6: input.sessionId ?? null,
        7: input.executionId ?? null,
        8: input.traceId ?? null,
        9: input.outcome,
        10: input.detail ?? {},
        11: input.ip ?? null,
        12: input.userAgent ?? null,
        13: createdAt,
      },
    );
    return {
      id,
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      sessionId: input.sessionId,
      executionId: input.executionId,
      traceId: input.traceId,
      outcome: input.outcome,
      detail: input.detail,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt,
    };
  }

  async listByUser(userId: string, options: AuditListOptions = {}): Promise<AuditEntry[]> {
    const conditions = ["user_id = $1"];
    const params: Record<string, unknown> = { 1: userId };
    let index = 2;

    if (options.action) {
      conditions.push(`action = $${index}`);
      params[index.toString()] = options.action;
      index++;
    }

    const limit = this.normalizeLimit(options.limit);
    const offset = this.normalizeOffset(options.offset);
    params[index.toString()] = limit;
    params[(index + 1).toString()] = offset;

    const result = await this.db.query(
      `SELECT * FROM audit_logs
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      params,
    );

    return result.rows.map((row) => this.rowToEntry(row));
  }

  private rowToEntry(row: DbRow): AuditEntry {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      action: String(row.action) as AuditEntry["action"],
      resourceType: row.resource_type ? String(row.resource_type) : undefined,
      resourceId: row.resource_id ? String(row.resource_id) : undefined,
      sessionId: row.session_id ? String(row.session_id) : undefined,
      executionId: row.execution_id ? String(row.execution_id) : undefined,
      traceId: row.trace_id ? String(row.trace_id) : undefined,
      outcome: String(row.outcome) as AuditOutcome,
      detail: (row.detail as Record<string, unknown> | undefined) ?? undefined,
      ip: row.ip ? String(row.ip) : undefined,
      userAgent: row.user_agent ? String(row.user_agent) : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) return 50;
    return Math.max(1, Math.min(100, Math.trunc(limit)));
  }

  private normalizeOffset(offset: number | undefined): number {
    if (offset === undefined) return 0;
    return Math.max(0, Math.trunc(offset));
  }
}
