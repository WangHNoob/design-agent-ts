import type {
  RateLimitCheckInput,
  RateLimitPort,
  RateLimitResult,
} from "../../port/cost/RateLimitPort.js";
import type { RateLimitCode, RateLimitRemaining } from "../../port/cost/types.js";

export interface SlidingWindowLimiterOptions {
  readonly rpmLimitPerUser: number;
  readonly tpmLimitPerUser: number;
  readonly globalRpmLimit: number;
  readonly globalTpmLimit: number;
  readonly windowMs: number;
}

interface WindowBucket {
  rpmEvents: number[];
  tpmEvents: Array<{ at: number; tokens: number }>;
}

const GLOBAL_USER = "__global__";

/**
 * In-memory sliding-window rate limiter for tests and local dev.
 * Keys are compartmentalized per userId; global caps use a dedicated bucket.
 */
export class InMemorySlidingWindowLimiter implements RateLimitPort {
  private readonly buckets = new Map<string, WindowBucket>();

  constructor(private readonly options: SlidingWindowLimiterOptions) {}

  async checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitResult> {
    const consume = input.consume !== false;
    const rpmDelta = input.rpmDelta ?? 0;
    const tpmDelta = input.tpmDelta ?? 0;
    const now = Date.now();

    const userBucket = this.getBucket(input.userId);
    this.prune(userBucket, now);

    if (rpmDelta > 0 && this.options.rpmLimitPerUser > 0) {
      const used = userBucket.rpmEvents.length;
      if (used + rpmDelta > this.options.rpmLimitPerUser) {
        return this.deny("RATE_LIMIT_RPM", this.options.rpmLimitPerUser - used, now, userBucket);
      }
    }

    if (tpmDelta > 0 && this.options.tpmLimitPerUser > 0) {
      const used = this.sumTokens(userBucket.tpmEvents);
      if (used + tpmDelta > this.options.tpmLimitPerUser) {
        return this.deny("RATE_LIMIT_TPM", this.options.tpmLimitPerUser - used, now, userBucket);
      }
    }

    const globalBucket = this.getBucket(GLOBAL_USER);
    this.prune(globalBucket, now);

    if (rpmDelta > 0 && this.options.globalRpmLimit > 0) {
      const used = globalBucket.rpmEvents.length;
      if (used + rpmDelta > this.options.globalRpmLimit) {
        return this.deny("RATE_LIMIT_RPM", this.options.globalRpmLimit - used, now, globalBucket);
      }
    }

    if (tpmDelta > 0 && this.options.globalTpmLimit > 0) {
      const used = this.sumTokens(globalBucket.tpmEvents);
      if (used + tpmDelta > this.options.globalTpmLimit) {
        return this.deny("RATE_LIMIT_TPM", this.options.globalTpmLimit - used, now, globalBucket);
      }
    }

    if (consume) {
      if (rpmDelta > 0) {
        for (let i = 0; i < rpmDelta; i++) {
          userBucket.rpmEvents.push(now);
          if (this.options.globalRpmLimit > 0) {
            globalBucket.rpmEvents.push(now);
          }
        }
      }
      if (tpmDelta > 0) {
        userBucket.tpmEvents.push({ at: now, tokens: tpmDelta });
        if (this.options.globalTpmLimit > 0) {
          globalBucket.tpmEvents.push({ at: now, tokens: tpmDelta });
        }
      }
    }

    return {
      allowed: true,
      remaining: await this.getRemaining(input.userId),
    };
  }

  async getRemaining(userId: string): Promise<RateLimitRemaining> {
    const now = Date.now();
    const userBucket = this.getBucket(userId);
    this.prune(userBucket, now);
    const remaining: { rpm?: number; tpm?: number } = {};
    if (this.options.rpmLimitPerUser > 0) {
      remaining.rpm = Math.max(0, this.options.rpmLimitPerUser - userBucket.rpmEvents.length);
    }
    if (this.options.tpmLimitPerUser > 0) {
      remaining.tpm = Math.max(
        0,
        this.options.tpmLimitPerUser - this.sumTokens(userBucket.tpmEvents),
      );
    }
    return remaining;
  }

  private deny(
    code: RateLimitCode,
    remainingAmount: number,
    now: number,
    bucket: WindowBucket,
  ): RateLimitResult {
    const oldest = bucket.rpmEvents[0] ?? bucket.tpmEvents[0]?.at ?? now;
    const retryAfterMs = Math.max(0, this.options.windowMs - (now - oldest));
    return {
      allowed: false,
      code,
      retryAfterMs,
      remaining: code === "RATE_LIMIT_RPM"
        ? { rpm: Math.max(0, remainingAmount) }
        : { tpm: Math.max(0, remainingAmount) },
    };
  }

  private getBucket(userId: string): WindowBucket {
    let bucket = this.buckets.get(userId);
    if (!bucket) {
      bucket = { rpmEvents: [], tpmEvents: [] };
      this.buckets.set(userId, bucket);
    }
    return bucket;
  }

  private prune(bucket: WindowBucket, now: number): void {
    const cutoff = now - this.options.windowMs;
    bucket.rpmEvents = bucket.rpmEvents.filter((at) => at > cutoff);
    bucket.tpmEvents = bucket.tpmEvents.filter((e) => e.at > cutoff);
  }

  private sumTokens(events: Array<{ at: number; tokens: number }>): number {
    return events.reduce((sum, e) => sum + e.tokens, 0);
  }
}
