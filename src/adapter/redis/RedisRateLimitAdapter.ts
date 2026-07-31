import type {
  RateLimitCheckInput,
  RateLimitPort,
  RateLimitResult,
} from "../../port/cost/RateLimitPort.js";
import type { RateLimitCode, RateLimitRemaining } from "../../port/cost/types.js";
import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";

export interface RedisRateLimitOptions {
  readonly rpmLimitPerUser: number;
  readonly tpmLimitPerUser: number;
  readonly globalRpmLimit: number;
  readonly globalTpmLimit: number;
  readonly windowMs: number;
  readonly keyPrefix?: string;
}

const CHECK_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local delta = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local consume = ARGV[4] == '1'

if limit <= 0 then
  return {1, limit, windowMs}
end

local current = tonumber(redis.call('GET', key) or '0')
if current + delta > limit then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then ttl = windowMs end
  return {0, math.max(0, limit - current), ttl}
end

if consume and delta > 0 then
  local next = redis.call('INCRBY', key, delta)
  if tonumber(next) == delta then
    redis.call('PEXPIRE', key, windowMs)
  end
  current = next
else
  current = current + delta
end

local ttl = redis.call('PTTL', key)
if ttl < 0 then ttl = windowMs end
return {1, math.max(0, limit - current), ttl}
`;

/**
 * Fixed-window Redis rate limiter with per-user compartment keys.
 * Global caps use dedicated gd:global:* keys independent of tenant buckets.
 */
export class RedisRateLimitAdapter implements RateLimitPort {
  private readonly redis: RedisType;
  private readonly prefix: string;
  private readonly scriptSha: Promise<string>;

  constructor(
    redisUrl: string,
    private readonly options: RedisRateLimitOptions,
  ) {
    this.redis = new Redis.default(redisUrl, { lazyConnect: true });
    this.prefix = options.keyPrefix ?? "gd:";
    this.scriptSha = this.redis.script("LOAD", CHECK_SCRIPT).then(String);
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    await this.scriptSha;
  }

  async checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitResult> {
    const consume = input.consume !== false;
    const rpmDelta = input.rpmDelta ?? 0;
    const tpmDelta = input.tpmDelta ?? 0;

    if (rpmDelta > 0 && this.options.rpmLimitPerUser > 0) {
      const result = await this.runCheck(
        this.userKey(input.userId, "rpm"),
        this.options.rpmLimitPerUser,
        rpmDelta,
        consume,
      );
      if (!result.allowed) {
        return {
          allowed: false,
          code: "RATE_LIMIT_RPM",
          retryAfterMs: result.retryAfterMs,
          remaining: { rpm: result.remaining },
        };
      }
    }

    if (tpmDelta > 0 && this.options.tpmLimitPerUser > 0) {
      const result = await this.runCheck(
        this.userKey(input.userId, "tpm"),
        this.options.tpmLimitPerUser,
        tpmDelta,
        consume,
      );
      if (!result.allowed) {
        return {
          allowed: false,
          code: "RATE_LIMIT_TPM",
          retryAfterMs: result.retryAfterMs,
          remaining: { tpm: result.remaining },
        };
      }
    }

    if (rpmDelta > 0 && this.options.globalRpmLimit > 0) {
      const result = await this.runCheck(
        this.globalKey("rpm"),
        this.options.globalRpmLimit,
        rpmDelta,
        consume,
      );
      if (!result.allowed) {
        return {
          allowed: false,
          code: "RATE_LIMIT_RPM",
          retryAfterMs: result.retryAfterMs,
          remaining: { rpm: result.remaining },
        };
      }
    }

    if (tpmDelta > 0 && this.options.globalTpmLimit > 0) {
      const result = await this.runCheck(
        this.globalKey("tpm"),
        this.options.globalTpmLimit,
        tpmDelta,
        consume,
      );
      if (!result.allowed) {
        return {
          allowed: false,
          code: "RATE_LIMIT_TPM",
          retryAfterMs: result.retryAfterMs,
          remaining: { tpm: result.remaining },
        };
      }
    }

    return {
      allowed: true,
      remaining: await this.getRemaining(input.userId),
    };
  }

  async getRemaining(userId: string): Promise<RateLimitRemaining> {
    const remaining: { rpm?: number; tpm?: number } = {};
    if (this.options.rpmLimitPerUser > 0) {
      const current = Number(await this.redis.get(this.userKey(userId, "rpm")) ?? 0);
      remaining.rpm = Math.max(0, this.options.rpmLimitPerUser - current);
    }
    if (this.options.tpmLimitPerUser > 0) {
      const current = Number(await this.redis.get(this.userKey(userId, "tpm")) ?? 0);
      remaining.tpm = Math.max(0, this.options.tpmLimitPerUser - current);
    }
    return remaining;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  private async runCheck(
    key: string,
    limit: number,
    delta: number,
    consume: boolean,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const sha = await this.scriptSha;
    const raw = await this.redis.evalsha(
      sha,
      1,
      key,
      limit.toString(),
      delta.toString(),
      this.options.windowMs.toString(),
      consume ? "1" : "0",
    );
    if (!Array.isArray(raw) || raw.length < 3) {
      throw new Error("Redis rate limit script returned invalid result");
    }
    const allowed = Number(raw[0]) === 1;
    const remaining = Number(raw[1]);
    const retryAfterMs = Number(raw[2]);
    return { allowed, remaining, retryAfterMs };
  }

  private userKey(userId: string, metric: "rpm" | "tpm"): string {
    return `${this.prefix}tenant:${userId}:${metric}`;
  }

  private globalKey(metric: "rpm" | "tpm"): string {
    return `${this.prefix}global:${metric}`;
  }
}
