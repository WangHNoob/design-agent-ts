import type {
  TenantIsolationPort,
  TenantContext,
  LockOptions,
  DistributedLock,
  CacheOptions,
} from "../../port/user/TenantIsolationPort.js";
import type { UserPort } from "../../port/user/UserPort.js";
import type { UserRole } from "../../port/user/UserPort.js";
import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";

/** Composition-root knobs for Redis-backed infra (defaults match historical behavior). */
export interface RedisTenantIsolationOptions {
  readonly lockWaitTimeoutMs?: number;
  readonly lockTtlMs?: number;
  readonly lockRetries?: number;
  readonly lockRetryDelayMs?: number;
  /** Tenant context cache TTL in seconds. Default 300. */
  readonly tenantContextCacheTtlSeconds?: number;
  /** Concurrency slot TTL in seconds. Default 3600. */
  readonly concurrencySlotTtlSeconds?: number;
}

const DEFAULT_LOCK_OPTIONS: LockOptions = {
  waitTimeoutMs: 5000,
  ttlMs: 30000,
  retries: 10,
  retryDelayMs: 500,
};

/**
 * Redis-backed TenantIsolationPort adapter.
 *
 * Provides:
 * - Tenant context resolution via Better Auth session (delegated to UserPort)
 * - Distributed locking with Redis SET NX EX
 * - Tenant-scoped caching with TTL
 * - Atomic concurrency control via Redis Lua
 */
export class RedisTenantIsolationAdapter implements TenantIsolationPort {
  private redis: RedisType;
  private readonly lockDefaults: LockOptions;
  private readonly tenantCacheTtlSeconds: number;
  private readonly concurrencySlotTtlSeconds: number;

  constructor(
    redisUrl: string,
    private readonly userPort: UserPort,
    private readonly keyPrefix: string = "gd:",
    options: RedisTenantIsolationOptions = {},
  ) {
    this.redis = new Redis.default(redisUrl, { lazyConnect: true });
    this.lockDefaults = {
      ...DEFAULT_LOCK_OPTIONS,
      ...(options.lockWaitTimeoutMs !== undefined ? { waitTimeoutMs: options.lockWaitTimeoutMs } : {}),
      ...(options.lockTtlMs !== undefined ? { ttlMs: options.lockTtlMs } : {}),
      ...(options.lockRetries !== undefined ? { retries: options.lockRetries } : {}),
      ...(options.lockRetryDelayMs !== undefined ? { retryDelayMs: options.lockRetryDelayMs } : {}),
    };
    this.tenantCacheTtlSeconds = options.tenantContextCacheTtlSeconds ?? 300;
    this.concurrencySlotTtlSeconds = options.concurrencySlotTtlSeconds ?? 3600;
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  // ─── Tenant Context ──────────────────────────────────────────

  async resolveTenantFromHeaders(headers: Record<string, string | undefined>): Promise<TenantContext | null> {
    // Try Redis cache first (by cookie/session token)
    const cookieHeader = headers["cookie"] ?? "";
    const sessionToken = this.extractSessionToken(cookieHeader);

    if (sessionToken) {
      const cacheKey = this.buildKey("tenant_ctx", sessionToken);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as TenantContext;
        } catch {
          // Fall through to Better Auth verification
        }
      }
    }

    // Delegate to Better Auth via UserPort
    const session = await this.userPort.resolveSession(headers);
    if (!session) return null;

    // Check if user is still active
    const user = await this.userPort.getUser(session.userId);
    if (!user || !user.isActive) return null;

    const ctx: TenantContext = {
      userId: user.id,
      role: user.role as UserRole,
      sessionId: session.sessionId,
    };

    // Cache tenant context for tenantCacheTtlSeconds (keyed by session token)
    if (sessionToken) {
      const cacheKey = this.buildKey("tenant_ctx", sessionToken);
      await this.redis.set(cacheKey, JSON.stringify(ctx), "EX", this.tenantCacheTtlSeconds);
    }

    return ctx;
  }

  scopeKey(userId: string, resourceType: string, key?: string): string {
    const base = this.buildKey("tenant", userId, resourceType);
    return key ? `${base}:${key}` : base;
  }

  // ─── Distributed Locking ─────────────────────────────────────

  async acquireLock(key: string, options?: Partial<LockOptions>): Promise<DistributedLock | null> {
    const opts = { ...this.lockDefaults, ...options };
    const lockKey = this.buildKey("lock", key);
    const holderId = `holder_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ttlSeconds = Math.ceil(opts.ttlMs / 1000);

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      const acquired = await this.redis.set(lockKey, holderId, "EX", ttlSeconds, "NX");
      if (acquired === "OK") {
        return {
          key,
          holderId,
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + opts.ttlMs).toISOString(),
        };
      }

      if (attempt < opts.retries) {
        await this.sleep(opts.retryDelayMs);
      }
    }

    return null;
  }

  async releaseLock(lock: DistributedLock): Promise<boolean> {
    const lockKey = this.buildKey("lock", lock.key);

    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lock.holderId);
    return result === 1;
  }

  async extendLock(lock: DistributedLock, ttlMs: number): Promise<DistributedLock | null> {
    const lockKey = this.buildKey("lock", lock.key);
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("EXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lock.holderId, ttlSeconds.toString());
    if (result !== 1) return null;

    return {
      ...lock,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
  }

  // ─── Tenant-Scoped Cache ─────────────────────────────────────

  async cacheGet(userId: string, key: string): Promise<string | null> {
    const cacheKey = this.scopeKey(userId, "cache", key);
    return this.redis.get(cacheKey);
  }

  async cacheSet(userId: string, key: string, value: string, options?: CacheOptions): Promise<void> {
    const cacheKey = this.scopeKey(userId, "cache", key);
    if (options?.ttlMs) {
      await this.redis.set(cacheKey, value, "PX", options.ttlMs);
    } else {
      await this.redis.set(cacheKey, value);
    }
  }

  async cacheDelete(userId: string, key: string): Promise<boolean> {
    const cacheKey = this.scopeKey(userId, "cache", key);
    const result = await this.redis.del(cacheKey);
    return result > 0;
  }

  async cacheInvalidate(userId: string): Promise<number> {
    const pattern = this.scopeKey(userId, "cache", "*");
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return 0;
    return this.redis.del(...keys);
  }

  // ─── Concurrency Control ─────────────────────────────────────

  async acquireConcurrencySlot(
    userId: string,
    maxConcurrent: number,
  ): Promise<{ acquired: boolean; current: number }> {
    const key = this.scopeKey(userId, "concurrent");
    const script = `
      local current = tonumber(redis.call("GET", KEYS[1]) or "0")
      local limit = tonumber(ARGV[1])
      if current >= limit then
        return {0, current}
      end
      local next = redis.call("INCR", KEYS[1])
      if next == 1 then
        redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
      end
      return {1, next}
    `;
    const result = await this.redis.eval(script, 1, key, maxConcurrent.toString(), String(this.concurrencySlotTtlSeconds));
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("Redis returned an invalid concurrency acquisition result");
    }
    return {
      acquired: Number(result[0]) === 1,
      current: Number(result[1]),
    };
  }

  async releaseConcurrencySlot(userId: string): Promise<number> {
    const key = this.scopeKey(userId, "concurrent");
    const script = `
      local current = tonumber(redis.call("GET", KEYS[1]) or "0")
      if current <= 1 then
        redis.call("DEL", KEYS[1])
        return 0
      end
      return redis.call("DECR", KEYS[1])
    `;
    return Number(await this.redis.eval(script, 1, key));
  }

  // ─── Health ──────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  // ─── Private ─────────────────────────────────────────────────

  private buildKey(...parts: string[]): string {
    return `${this.keyPrefix}${parts.join(":")}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract Better Auth session token from cookie header.
   * Better Auth uses `better-auth.session_token` as the cookie name.
   */
  private extractSessionToken(cookieHeader: string): string | null {
    const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
    return match?.[1] ?? null;
  }
}
