import type { DatabasePort, QueryParams, QueryResult, TransactionOptions } from "../../port/infra/DatabasePort.js";
import pg from "pg";

/**
 * PostgreSQL adapter for the DatabasePort.
 *
 * Uses the `pg` driver with connection pooling.
 * Supports parameterized queries ($1, $2, ... syntax) and transactions.
 */
export class PostgresDatabaseAdapter implements DatabasePort {
  private pool: pg.Pool;

  constructor(connectionString: string, private readonly poolConfig?: { max?: number; idleTimeoutMs?: number }) {
    this.pool = new pg.Pool({
      connectionString,
      max: poolConfig?.max ?? 20,
      idleTimeoutMillis: poolConfig?.idleTimeoutMs ?? 30000,
    });
  }

  async query(sql: string, params?: QueryParams): Promise<QueryResult> {
    // Convert named params ($name) to positional ($1, $2, ...) for pg driver
    const { positionalSql, values } = this.convertParams(sql, params);
    const result = await this.pool.query(positionalSql, values);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    };
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>, options?: TransactionOptions): Promise<T> {
    const client = await this.pool.connect();
    try {
      const isolation = options?.isolationLevel ?? "read committed";
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      if (options?.readOnly) {
        await client.query("SET TRANSACTION READ ONLY");
      }

      const txAdapter = new PostgresTransactionAdapter(client);
      const result = await fn(txAdapter);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Initialize the database schema.
   * Called once at startup — idempotent (uses IF NOT EXISTS).
   *
   * Note: Better Auth tables ("user", "session", "account", "verification")
   * are also created here for convenience (idempotent via IF NOT EXISTS).
   */
  async initializeSchema(): Promise<void> {
    // Enable pgvector extension first (required for VECTOR type)
    try {
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    } catch (err) {
      console.warn("[PostgresDatabaseAdapter] pgvector extension not available, vector search disabled:", err);
    }

    await this.pool.query(`
      -- User assets table (polymorphic: stores all asset types)
      -- References Better Auth's "user" table
      CREATE TABLE IF NOT EXISTS user_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        asset_type VARCHAR(50) NOT NULL,
        asset_key VARCHAR(255) NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        owner VARCHAR(10) NOT NULL DEFAULT 'user',
        is_mutable BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(asset_type, asset_key, user_id)
      );

      -- Index for fast tenant-scoped lookups
      CREATE INDEX IF NOT EXISTS idx_user_assets_user_type ON user_assets(user_id, asset_type);
      CREATE INDEX IF NOT EXISTS idx_user_assets_system ON user_assets(owner, asset_type) WHERE owner = 'system';

      -- Application sessions table (game design sessions, not auth sessions)
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(36),
        requirement TEXT NOT NULL,
        mode VARCHAR(20) NOT NULL,
        role VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'running',
        output TEXT,
        error TEXT,
        hitl_checkpoint_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, status);

      -- Long-term memory table (replaces file-based LTM)
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(36) NOT NULL,
        semantic_type VARCHAR(20) NOT NULL,
        namespace VARCHAR(100) NOT NULL,
        key VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(1536),
        importance REAL NOT NULL DEFAULT 0.5,
        access_count INT NOT NULL DEFAULT 0,
        tags TEXT[],
        ttl_ms BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ltm_user_ns ON long_term_memory(user_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_ltm_type ON long_term_memory(semantic_type);

      -- Updated_at trigger function
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Auto-update triggers
      DROP TRIGGER IF EXISTS trg_user_assets_updated_at ON user_assets;
      CREATE TRIGGER trg_user_assets_updated_at BEFORE UPDATE ON user_assets
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

      DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
      CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    // ── Better Auth tables (idempotent via IF NOT EXISTS) ──────────
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        image TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "lastLoginAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "session" (
        id TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "account" (
        id TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        "providerId" TEXT NOT NULL,
        "accountId" TEXT NOT NULL,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "accessTokenExpiresAt" TIMESTAMPTZ,
        "refreshTokenExpiresAt" TIMESTAMPTZ,
        "scope" TEXT,
        "idToken" TEXT,
        "password" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "verification" (
        id TEXT NOT NULL PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  /**
   * Convert named parameter syntax to pg positional syntax.
   * Input:  "SELECT * FROM users WHERE id = $id AND email = $email", { id: "123", email: "a@b.c" }
   * Output: "SELECT * FROM users WHERE id = $1 AND email = $2", ["123", "a@b.c"]
   */
  private convertParams(sql: string, params?: QueryParams): { positionalSql: string; values: unknown[] } {
    if (!params || Object.keys(params).length === 0) {
      return { positionalSql: sql, values: [] };
    }

    const values: unknown[] = [];
    let positionalSql = sql;
    let idx = 1;

    for (const [key, value] of Object.entries(params)) {
      const regex = new RegExp(`\\$${key}\\b`, "g");
      positionalSql = positionalSql.replace(regex, () => {
        values.push(value);
        return `$${idx++}`;
      });
    }

    return { positionalSql, values };
  }
}

/**
 * Transaction-scoped adapter that uses a single pg Client.
 */
class PostgresTransactionAdapter implements DatabasePort {
  constructor(private readonly client: pg.PoolClient) {}

  async query(sql: string, params?: QueryParams): Promise<QueryResult> {
    // For transactions, we use positional params directly
    const values = params ? Object.values(params) : [];
    const result = await this.client.query(sql, values);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    };
  }

  async transaction<T>(fn: (tx: DatabasePort) => Promise<T>, options?: TransactionOptions): Promise<T> {
    // Nested transaction via SAVEPOINT
    const savepointName = `sp_${Date.now()}`;
    try {
      await this.client.query(`SAVEPOINT ${savepointName}`);
      const result = await fn(this);
      await this.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (err) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`).catch(() => {});
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    return true; // In a transaction, we know the connection is alive
  }

  async close(): Promise<void> {
    // No-op: the outer transaction manages the client lifecycle
  }
}
