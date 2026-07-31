import type {
  TenantIsolationPort,
  TenantContext,
  LockOptions,
  DistributedLock,
  CacheOptions,
} from "../../port/user/TenantIsolationPort.js";
import type { UserPort, UserRole } from "../../port/user/UserPort.js";

const DEFAULT_LOCK_OPTIONS: LockOptions = {
  waitTimeoutMs: 5000,
  ttlMs: 30000,
  retries: 10,
  retryDelayMs: 500,
};

interface Expirable<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-process TenantIsolationPort adapter — a lightweight, zero-dependency
 * fallback for single-instance deployments (local dev, CI) where Redis is not
 * available.
 *
 * Provides:
 * - Tenant context resolution via Better Auth session (delegated to UserPort)
 * - In-process locking with TTL (sufficient for single-instance)
 * - In-process tenant-scoped caching with TTL
 * - In-process concurrency control
 *
 * Not suitable for multi-instance deployments — use RedisTenantIsolationAdapter
 * there. Lives in core/ (only depends on port/ interfaces).
 */
export class InMemoryTenantIsolationAdapter implements TenantIsolationPort {
  private readonly locks = new Map<string, DistributedLock>();
  private readonly cache = new Map<string, Expirable<string>>();
  private readonly concurrency = new Map<string, number>();
  private readonly tenantCache = new Map<string, Expirable<TenantContext>>();

  constructor(private readonly userPort: UserPort) {}

  // No external connection needed.
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  // ─── Tenant Context ──────────────────────────────────────────

  async resolveTenantFromHeaders(headers: Record<string, string | undefined>): Promise<TenantContext | null> {
    const cookieHeader = headers["cookie"] ?? "";
    const sessionToken = extractSessionToken(cookieHeader);

    // Check in-process cache first.
    if (sessionToken) {
      const cached = this.tenantCache.get(sessionToken);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    // Delegate to Better Auth via UserPort.
    const session = await this.userPort.resolveSession(headers);
    if (!session) return null;

    const user = await this.userPort.getUser(session.userId);
    if (!user || !user.isActive) return null;

    const ctx: TenantContext = {
      userId: user.id,
      role: user.role as UserRole,
      sessionId: session.sessionId,
    };

    // Cache for 5 minutes.
    if (sessionToken) {
      this.tenantCache.set(sessionToken, { value: ctx, expiresAt: Date.now() + 300_000 });
    }

    return ctx;
  }

  scopeKey(userId: string, resourceType: string, key?: string): string {
    const base = `gd:tenant:${userId}:${resourceType}`;
    return key ? `${base}:${key}` : base;
  }

  // ─── Locking ─────────────────────────────────────────────────

  async acquireLock(key: string, options?: Partial<LockOptions>): Promise<DistributedLock | null> {
    const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
    const holderId = `holder_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = Date.now();

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      // Purge expired locks.
      this.purgeExpiredLock(key);
      const existing = this.locks.get(key);
      if (!existing) {
        const lock: DistributedLock = {
          key,
          holderId,
          acquiredAt: new Date(now).toISOString(),
          expiresAt: new Date(now + opts.ttlMs).toISOString(),
        };
        this.locks.set(key, lock);
        return lock;
      }
      if (attempt < opts.retries) {
        await sleep(Math.min(opts.retryDelayMs, opts.waitTimeoutMs));
      }
    }
    return null;
  }

  async releaseLock(lock: DistributedLock): Promise<boolean> {
    const existing = this.locks.get(lock.key);
    if (existing && existing.holderId === lock.holderId) {
      this.locks.delete(lock.key);
      return true;
    }
    return false;
  }

  async extendLock(lock: DistributedLock, ttlMs: number): Promise<DistributedLock | null> {
    const existing = this.locks.get(lock.key);
    if (existing && existing.holderId === lock.holderId) {
      const extended: DistributedLock = {
        ...existing,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      };
      this.locks.set(lock.key, extended);
      return extended;
    }
    return null;
  }

  // ─── Cache ───────────────────────────────────────────────────

  async cacheGet(userId: string, key: string): Promise<string | null> {
    const fullKey = `${userId}:${key}`;
    const entry = this.cache.get(fullKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(fullKey);
      return null;
    }
    return entry.value;
  }

  async cacheSet(userId: string, key: string, value: string, options?: CacheOptions): Promise<void> {
    const fullKey = `${userId}:${key}`;
    const ttl = options?.ttlMs ?? 300_000;
    this.cache.set(fullKey, { value, expiresAt: Date.now() + ttl });
  }

  async cacheDelete(userId: string, key: string): Promise<boolean> {
    const fullKey = `${userId}:${key}`;
    return this.cache.delete(fullKey);
  }

  async cacheInvalidate(userId: string): Promise<number> {
    let count = 0;
    for (const fullKey of this.cache.keys()) {
      if (fullKey.startsWith(`${userId}:`)) {
        this.cache.delete(fullKey);
        count++;
      }
    }
    return count;
  }

  // ─── Concurrency Control ─────────────────────────────────────

  async acquireConcurrencySlot(
    userId: string,
    maxConcurrent: number,
  ): Promise<{ acquired: boolean; current: number }> {
    const current = this.concurrency.get(userId) ?? 0;
    if (current >= maxConcurrent) {
      return { acquired: false, current };
    }
    const next = current + 1;
    this.concurrency.set(userId, next);
    return { acquired: true, current: next };
  }

  async releaseConcurrencySlot(userId: string): Promise<number> {
    const current = this.concurrency.get(userId) ?? 0;
    const next = Math.max(0, current - 1);
    if (next === 0) {
      this.concurrency.delete(userId);
    } else {
      this.concurrency.set(userId, next);
    }
    return next;
  }

  // ─── Health ──────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    return true;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private purgeExpiredLock(key: string): void {
    const existing = this.locks.get(key);
    if (existing && new Date(existing.expiresAt).getTime() <= Date.now()) {
      this.locks.delete(key);
    }
  }
}

/** Extract the Better Auth session token from a cookie header. */
function extractSessionToken(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  // Better Auth stores the session as "better-auth.session_token=..."
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
  return match ? (match[1] ?? null) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
