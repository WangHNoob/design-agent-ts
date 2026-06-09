/**
 * Relational database port — structured data persistence for users, assets, sessions.
 *
 * Used for:
 * - User accounts and authentication
 * - User asset ownership and permission checks
 * - Session metadata (replaces file-based SessionManager)
 * - Long-term memory metadata (content + embeddings)
 *
 * Adapter implementations may use PostgreSQL, MySQL, SQLite, etc.
 * This port intentionally uses a simple query interface rather than
 * a full ORM to keep it framework-agnostic.
 */

/** A row from a database query. */
export type DbRow = Record<string, unknown>;

/** Query parameters for parameterized queries. */
export type QueryParams = Record<string, unknown>;

/** Result of a database query. */
export interface QueryResult {
  readonly rows: DbRow[];
  readonly rowCount: number;
}

/** Transaction isolation level. */
export type IsolationLevel = "read committed" | "repeatable read" | "serializable";

/** Options for starting a transaction. */
export interface TransactionOptions {
  readonly isolationLevel?: IsolationLevel;
  readonly readOnly?: boolean;
}

/**
 * Port interface for relational database operations.
 *
 * Implementations must:
 * - Support parameterized queries (prevent SQL injection)
 * - Support transactions with proper isolation
 * - Handle connection pooling
 * - Provide health checks
 */
export interface DatabasePort {
  /** Execute a parameterized query. */
  query(sql: string, params?: QueryParams): Promise<QueryResult>;

  /** Execute multiple queries in a transaction. */
  transaction<T>(fn: (tx: DatabasePort) => Promise<T>, options?: TransactionOptions): Promise<T>;

  /** Check if the database is reachable. */
  healthCheck(): Promise<boolean>;

  /** Close all connections. */
  close(): Promise<void>;
}
