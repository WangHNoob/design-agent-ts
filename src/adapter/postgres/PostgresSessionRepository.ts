import type { SessionMeta, SessionRepository } from "../../port/session/SessionRepository.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";

/**
 * PostgreSQL-backed session repository.
 *
 * Stores session metadata in the `sessions` table with user isolation.
 * Replaces the file-based SessionManager for multi-user deployments.
 */
export class PostgresSessionRepository implements SessionRepository {
  constructor(
    private readonly db: DatabasePort,
    private readonly userId: string,
  ) {}

  async create(meta: SessionMeta): Promise<void> {
    await this.db.query(
      `INSERT INTO sessions (id, user_id, requirement, mode, role, status, output, error, hitl_checkpoint_id, version_snapshot_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      {
        1: meta.id,
        2: this.userId,
        3: meta.requirement,
        4: meta.mode,
        5: meta.role,
        6: meta.status,
        7: meta.output ?? null,
        8: meta.error ?? null,
        9: meta.hitlCheckpointId ?? null,
        10: meta.versionSnapshotId ?? null,
        11: meta.createdAt,
        12: meta.updatedAt,
      }
    );
  }

  async update(id: string, patch: Partial<SessionMeta>): Promise<void> {
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    let paramIdx = 1;

    const fieldMap: Record<string, keyof SessionMeta> = {
      requirement: "requirement",
      mode: "mode",
      role: "role",
      status: "status",
      output: "output",
      error: "error",
      hitl_checkpoint_id: "hitlCheckpointId",
      version_snapshot_id: "versionSnapshotId",
    };

    for (const [dbCol, metaKey] of Object.entries(fieldMap)) {
      if (patch[metaKey] !== undefined) {
        sets.push(`${dbCol} = $${paramIdx}`);
        values[paramIdx.toString()] = patch[metaKey];
        paramIdx++;
      }
    }

    sets.push(`updated_at = $${paramIdx}`);
    values[paramIdx.toString()] = new Date().toISOString();
    paramIdx++;

    values[paramIdx.toString()] = id;
    values[(paramIdx + 1).toString()] = this.userId;

    await this.db.query(
      `UPDATE sessions SET ${sets.join(", ")} WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1}`,
      values
    );
  }

  async get(id: string): Promise<SessionMeta | null> {
    const result = await this.db.query(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId }
    );
    if (result.rows.length === 0) return null;
    return this.rowToMeta(result.rows[0]!);
  }

  async list(limit = 50, offset = 0): Promise<SessionMeta[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const result = await this.db.query(
      `SELECT * FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`,
      { 1: this.userId, 2: safeLimit, 3: safeOffset }
    );
    return result.rows.map((r) => this.rowToMeta(r));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId }
    );
    return result.rowCount > 0;
  }

  private rowToMeta(row: Record<string, unknown>): SessionMeta {
    return {
      id: row.id as string,
      requirement: row.requirement as string,
      mode: row.mode as "design" | "query" | "table",
      role: row.role as string,
      status: row.status as SessionMeta["status"],
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
      output: this.optionalString(row.output),
      error: this.optionalString(row.error),
      hitlCheckpointId: this.optionalString(row.hitl_checkpoint_id),
      versionSnapshotId: this.optionalString(row.version_snapshot_id),
    };
  }

  private toIso(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new TypeError(`Invalid database timestamp: ${String(value)}`);
    }
    return date.toISOString();
  }

  private optionalString(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
  }
}
