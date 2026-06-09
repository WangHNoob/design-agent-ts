import type {
  TenantIsolationPort,
  TenantContext,
  LockOptions,
  DistributedLock,
  CacheOptions,
} from "../../port/user/TenantIsolationPort.js";
import type { UserPort, TokenPayload } from "../../port/user/UserPort.js";
import type { UserRole } from "../../port/user/UserPort.js";
import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";

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
 * - Tenant context resolution via UserPort token verification
 * - Distributed locking with Redis SET NX EX
 * - Tenant-scoped caching with TTL
 * - Concurrency control via Redis INCR/DECR
 */
export class RedisTenantIsolationAdapter implements TenantIsolationPort {
  private redis: RedisType;

  constructor(
    redisUrl: string,
    private readonly userPort: UserPort,
    private readonly keyPrefix: string = "gd:",
  ) {
    this.redis = new Redis.default(redisUrl, { lazyConnect: true });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  // ─── Tenant Context ──────────────────────────────────────────

  async resolveTenant(token: string): Promise<TenantContext | null> {
    const payload: TokenPayload | null = await this.userPort.verifyToken(token);
    if (!payload) return null;

    // Check if user is still active (cache this in Redis)
    const cacheKey = this.buildKey("tenant_ctx", payload.userId);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as TenantContext;
      } catch {
        // Fall through to DB check
      }
    }

    const user = await this.userPort.getUser(payload.userId);
    if (!user || !user.isActive) return null;

    const ctx: TenantContext = {
      userId: user.id,
      role: user.role as UserRole,
    };

    // Cache for 5 minutes
    await this.redis.set(cacheKey, JSON.stringify(ctx), "EX", 300);
    return ctx;
  }

  scopeKey(userId: string, resourceType: string, key?: string): string {
    const base = this.buildKey("tenant", userId, resourceType);
    return key ? `${base}:${key}` : base;
  }

  // ─── Distributed Locking ─────────────────────────────────────

  async acquireLock(key: string, options?: Partial<LockOptions>): Promise<DistributedLock | null> {
    const opts = { ...DEFAULT_LOCK_OPTIONS, ...options };
    const lockKey = this.buildKey("lock", key);
    const holderId = `holder_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ttlSeconds = Math.ceil(opts.ttlMs / 1000);

    // Try to acquire with retries
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

    // Only release if we still hold the lock (compare holderId)
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

    // Only extend if we still hold the lock
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

  async checkConcurrencyLimit(userId: string, maxConcurrent: number): Promise<{ allowed: boolean; current: number }> {
    const key = this.scopeKey(userId, "concurrent");
    const current = parseInt(await this.redis.get(key) ?? "0", 10);
    return { allowed: current < maxConcurrent, current };
  }

  async incrementConcurrency(userId: string): Promise<number> {
    const key = this.scopeKey(userId, "concurrent");
    const val = await this.redis.incr(key);
    // Set TTL as safety net (auto-expire after 1 hour)
    if (val === 1) {
      await this.redis.expire(key, 3600);
    }
    return val;
  }

  async decrementConcurrency(userId: string): Promise<number> {
    const key = this.scopeKey(userId, "concurrent");
    const val = await this.redis.decr(key);
    if (val <= 0) {
      await this.redis.del(key);
      return 0;
    }
    return val;
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

  /** Close the Redis connection. */
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
}
