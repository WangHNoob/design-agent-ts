import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { AppendAuditInput, AuditEntry, AuditListOptions } from "../../port/audit/types.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

export class InMemoryAuditStore implements AuditStorePort {
  private readonly entries: AuditEntry[] = [];

  constructor(private readonly idGenerator: IdGeneratorPort) {}

  async append(input: AppendAuditInput): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: this.idGenerator.randomUUID(),
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
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  async listByUser(userId: string, options: AuditListOptions = {}): Promise<AuditEntry[]> {
    let rows = this.entries.filter((e) => e.userId === userId);
    if (options.action) {
      rows = rows.filter((e) => e.action === options.action);
    }
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(1, Math.min(100, options.limit ?? 50));
    return rows.slice(offset, offset + limit);
  }

  /** Test helper — all stored entries. */
  all(): readonly AuditEntry[] {
    return this.entries;
  }
}
