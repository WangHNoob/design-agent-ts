/**
 * Tenant isolation port — enforces data and permission boundaries between users.
 *
 * This port provides a unified interface for tenant-scoped operations:
 * - All data access is scoped to a userId (tenant)
 * - System assets are shared but immutable
 * - Distributed locking for concurrent access control
 * - Cache management per tenant
 *
 * This is the "guard rail" that prevents cross-tenant data leakage.
 */

/** Tenant context carried through the request lifecycle. */
export interface TenantContext {
  readonly userId: string;
  readonly role: import("./UserPort.js").UserRole;
  readonly sessionId: string;
}

/** Lock options for distributed locking. */
export interface LockOptions {
  /** Maximum time to wait for the lock in milliseconds. 0 = no wait. */
  readonly waitTimeoutMs: number;
  /** Time after which the lock auto-expires (safety net). */
  readonly ttlMs: number;
  /** Number of retries while waiting. */
  readonly retries: number;
  /** Delay between retries in milliseconds. */
  readonly retryDelayMs: number;
}

/** A held distributed lock. */
export interface DistributedLock {
  readonly key: string;
  readonly holderId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

/** Cache options for tenant-scoped caching. */
export interface CacheOptions {
  /** Time-to-live in milliseconds. */
  readonly ttlMs: number;
}

/**
 * Port interface for tenant isolation operations.
 *
 * Adapter implementations may use:
 * - Redis for distributed locking and caching
 * - Better Auth for session-based tenant resolution
 * - PostgreSQL RLS (Row-Level Security) for data isolation
 * - A combination of both
 */
export interface TenantIsolationPort {
  // ─── Tenant Context ──────────────────────────────────────────

  /**
   * Resolve the tenant context from request headers.
   * Delegates to Better Auth for session validation.
   */
  resolveTenantFromHeaders(headers: Record<string, string | undefined>): Promise<TenantContext | null>;

  /** Create a tenant-scoped namespace key (e.g. "user:123:sessions"). */
  scopeKey(userId: string, resourceType: string, key?: string): string;

  // ─── Distributed Locking ─────────────────────────────────────

  /** Acquire a distributed lock. Returns null if lock cannot be acquired. */
  acquireLock(key: string, options?: Partial<LockOptions>): Promise<DistributedLock | null>;

  /** Release a distributed lock. */
  releaseLock(lock: DistributedLock): Promise<boolean>;

  /** Extend a lock's TTL. */
  extendLock(lock: DistributedLock, ttlMs: number): Promise<DistributedLock | null>;

  // ─── Tenant-Scoped Cache ─────────────────────────────────────

  /** Get a cached value for a tenant. */
  cacheGet(userId: string, key: string): Promise<string | null>;

  /** Set a cached value for a tenant. */
  cacheSet(userId: string, key: string, value: string, options?: CacheOptions): Promise<void>;

  /** Delete a cached value for a tenant. */
  cacheDelete(userId: string, key: string): Promise<boolean>;

  /** Invalidate all cached values for a tenant. */
  cacheInvalidate(userId: string): Promise<number>;

  // ─── Concurrency Control ─────────────────────────────────────

  /**
   * Atomically check and acquire a user's concurrent execution slot.
   * Implementations must not split the limit check from the increment.
   */
  acquireConcurrencySlot(
    userId: string,
    maxConcurrent: number,
  ): Promise<{ acquired: boolean; current: number }>;

  /** Release a previously acquired concurrent execution slot. */
  releaseConcurrencySlot(userId: string): Promise<number>;

  // ─── Health ──────────────────────────────────────────────────

  healthCheck(): Promise<boolean>;

  /** Release underlying connections/resources (no-op allowed for in-memory impls). */
  close(): Promise<void>;
}
