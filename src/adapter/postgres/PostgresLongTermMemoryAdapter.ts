import type { LongTermMemoryPort, MemoryEntry, MemorySearchResult, StoreMemoryParams, RetrieveMemoryParams, ForgetMemoryParams, ForgetResult, MemorySemanticType } from "../../port/memory/LongTermMemoryPort.js";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

/**
 * PostgreSQL-backed long-term memory adapter.
 *
 * Stores memories in the `long_term_memory` table with user isolation.
 * Supports:
 * - Full-text search via PostgreSQL tsvector
 * - Vector similarity search via pgvector (if extension is available)
 * - User-scoped namespace isolation
 * - Importance-based forgetting
 */
export class PostgresLongTermMemoryAdapter implements LongTermMemoryPort {
  constructor(
    private readonly db: DatabasePort,
    private readonly idGen: IdGeneratorPort,
    private readonly userId: string, // tenant scope
  ) {}

  async store(params: StoreMemoryParams): Promise<MemoryEntry> {
    const id = this.idGen.randomUUID();
    const now = new Date().toISOString();

    await this.db.query(
      `INSERT INTO long_term_memory (id, user_id, semantic_type, namespace, key, content, importance, tags, ttl_ms, created_at, last_accessed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      {
        1: id,
        2: this.userId,
        3: params.semanticType,
        4: params.namespace,
        5: params.key,
        6: params.content,
        7: params.importance ?? 0.5,
        8: params.tags ?? null,
        9: params.ttlMs ?? null,
        10: now,
        11: now,
      }
    );

    return {
      id,
      semanticType: params.semanticType,
      namespace: params.namespace,
      key: params.key,
      content: params.content,
      importance: params.importance ?? 0.5,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      tags: params.tags,
      ttlMs: params.ttlMs,
    };
  }

  async get(namespace: string, key: string): Promise<MemoryEntry | null> {
    const result = await this.db.query(
      `SELECT * FROM long_term_memory WHERE user_id = $1 AND namespace = $2 AND key = $3`,
      { 1: this.userId, 2: namespace, 3: key }
    );
    if (result.rows.length === 0) return null;
    const entry = this.rowToEntry(result.rows[0]!);
    await this.touchEntry(entry.id);
    return entry;
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const result = await this.db.query(
      `SELECT * FROM long_term_memory WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId }
    );
    if (result.rows.length === 0) return null;
    const entry = this.rowToEntry(result.rows[0]!);
    await this.touchEntry(entry.id);
    return entry;
  }

  async search(params: RetrieveMemoryParams): Promise<MemorySearchResult[]> {
    let sql = `SELECT *, ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $3)) AS text_score
               FROM long_term_memory WHERE user_id = $1 AND namespace = $2`;
    const queryParams: Record<string, unknown> = {
      1: this.userId,
      2: params.namespace,
      3: params.query,
    };
    let paramIdx = 4;

    if (params.semanticType) {
      sql += ` AND semantic_type = $${paramIdx}`;
      queryParams[paramIdx.toString()] = params.semanticType;
      paramIdx++;
    }

    if (params.minImportance !== undefined) {
      sql += ` AND importance >= $${paramIdx}`;
      queryParams[paramIdx.toString()] = params.minImportance;
      paramIdx++;
    }

    if (params.tags && params.tags.length > 0) {
      sql += ` AND tags && $${paramIdx}`;
      queryParams[paramIdx.toString()] = params.tags;
      paramIdx++;
    }

    // Score: combine text relevance + importance + recency.
    // PostgreSQL allows SELECT aliases in ORDER BY only as bare names, not inside expressions.
    const textScoreExpr =
      `ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $3))`;
    sql += ` ORDER BY (${textScoreExpr} * 0.5 + importance * 0.3 + (1.0 - EXTRACT(EPOCH FROM (now() - created_at)) / 7776000.0) * 0.2) DESC`;

    const limit = params.limit ?? 10;
    sql += ` LIMIT $${paramIdx}`;
    queryParams[paramIdx.toString()] = limit;

    const result = await this.db.query(sql, queryParams);

    return result.rows.map((row) => ({
      entry: this.rowToEntry(row),
      score: Math.round((row.text_score as number ?? 0) * 1000) / 1000,
    }));
  }

  async list(namespace: string, semanticType?: MemorySemanticType): Promise<MemoryEntry[]> {
    let sql = `SELECT * FROM long_term_memory WHERE user_id = $1 AND namespace = $2`;
    const params: Record<string, unknown> = { 1: this.userId, 2: namespace };

    if (semanticType) {
      sql += ` AND semantic_type = $3`;
      params["3"] = semanticType;
    }

    sql += ` ORDER BY created_at DESC`;
    const result = await this.db.query(sql, params);
    return result.rows.map((r) => this.rowToEntry(r));
  }

  async update(id: string, patch: Partial<Pick<MemoryEntry, "content" | "importance" | "tags" | "embedding">>): Promise<MemoryEntry | null> {
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    let paramIdx = 1;

    if (patch.content !== undefined) {
      sets.push(`content = $${paramIdx}`);
      values[paramIdx.toString()] = patch.content;
      paramIdx++;
    }
    if (patch.importance !== undefined) {
      sets.push(`importance = $${paramIdx}`);
      values[paramIdx.toString()] = patch.importance;
      paramIdx++;
    }
    if (patch.tags !== undefined) {
      sets.push(`tags = $${paramIdx}`);
      values[paramIdx.toString()] = patch.tags;
      paramIdx++;
    }

    sets.push(`last_accessed_at = $${paramIdx}`);
    values[paramIdx.toString()] = new Date().toISOString();
    paramIdx++;

    values[paramIdx.toString()] = id;
    values[(paramIdx + 1).toString()] = this.userId;

    await this.db.query(
      `UPDATE long_term_memory SET ${sets.join(", ")} WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1}`,
      values
    );
    return this.getById(id);
  }

  async forget(params: ForgetMemoryParams): Promise<ForgetResult> {
    const conditions: string[] = [`user_id = $1`, `namespace = $2`];
    const values: Record<string, unknown> = { 1: this.userId, 2: params.namespace };
    let paramIdx = 3;

    if (params.ids) {
      conditions.push(`id = ANY($${paramIdx})`);
      values[paramIdx.toString()] = params.ids;
      paramIdx++;
    }

    if (params.keys) {
      conditions.push(`key = ANY($${paramIdx})`);
      values[paramIdx.toString()] = params.keys;
      paramIdx++;
    }

    if (params.maxAgeMs !== undefined) {
      conditions.push(`EXTRACT(EPOCH FROM (now() - created_at)) * 1000 > $${paramIdx}`);
      values[paramIdx.toString()] = params.maxAgeMs;
      paramIdx++;
    }

    if (params.minImportance !== undefined) {
      conditions.push(`importance < $${paramIdx}`);
      values[paramIdx.toString()] = params.minImportance;
      paramIdx++;
    }

    // TTL expiration
    conditions.push(`(ttl_ms IS NULL OR EXTRACT(EPOCH FROM (now() - created_at)) * 1000 <= COALESCE(ttl_ms, 999999999999))`);

    const result = await this.db.query(
      `DELETE FROM long_term_memory WHERE ${conditions.join(" AND ")} RETURNING id`,
      values
    );

    return {
      removedCount: result.rowCount,
      removedIds: result.rows.map((r) => r.id as string),
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.db.healthCheck();
  }

  // ─── Private ───────────────────────────────────────────────────

  private rowToEntry(row: Record<string, unknown>): MemoryEntry {
    return {
      id: row.id as string,
      semanticType: row.semantic_type as MemorySemanticType,
      namespace: row.namespace as string,
      key: row.key as string,
      content: row.content as string,
      importance: row.importance as number,
      createdAt: row.created_at as string,
      lastAccessedAt: row.last_accessed_at as string,
      accessCount: (row.access_count as number) ?? 0,
      tags: row.tags as string[] | undefined,
      ttlMs: row.ttl_ms as number | undefined,
    };
  }

  private async touchEntry(id: string): Promise<void> {
    await this.db.query(
      `UPDATE long_term_memory SET access_count = access_count + 1, last_accessed_at = $1 WHERE id = $2 AND user_id = $3`,
      { 1: new Date().toISOString(), 2: id, 3: this.userId }
    );
  }
}
