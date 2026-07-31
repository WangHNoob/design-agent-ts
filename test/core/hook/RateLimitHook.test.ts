import { describe, expect, test } from "vitest";
import { RateLimitHook } from "../../../src/core/hook/RateLimitHook.js";
import { InMemorySlidingWindowLimiter } from "../../../src/core/cost/InMemorySlidingWindowLimiter.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";
import type { RateLimitPort, RateLimitResult } from "../../../src/port/cost/RateLimitPort.js";

describe("RateLimitHook", () => {
  test("aborts pre_reasoning with RATE_LIMIT_TPM when quota exhausted", async () => {
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 0,
      tpmLimitPerUser: 1000,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });
    await limiter.checkAndConsume({ userId: "u1", tpmDelta: 1000 });

    const hook = new RateLimitHook({
      enabled: true,
      rateLimit: limiter,
      tpmEstimatePerCall: 100,
      resolveUserId: () => "u1",
    });

    const ctx = await hook.onEvent("pre_reasoning", HookContext.create({}));
    expect(ctx.abort).toBe(true);
    expect(ctx.metadata.rateLimitCode).toBe("RATE_LIMIT_TPM");
    expect(ctx.abortReason).toMatch(/RATE_LIMIT_TPM/);
  });

  test("aborts pre_reasoning when rate limit backend throws (fail-closed)", async () => {
    const failingRateLimit: RateLimitPort = {
      checkAndConsume: async (): Promise<RateLimitResult> => {
        throw new Error("Redis connection refused");
      },
      getRemaining: async () => ({}),
    };

    const hook = new RateLimitHook({
      enabled: true,
      rateLimit: failingRateLimit,
      tpmEstimatePerCall: 100,
      resolveUserId: () => "u1",
    });

    const ctx = await hook.onEvent("pre_reasoning", HookContext.create({}));
    expect(ctx.abort).toBe(true);
    expect(ctx.metadata.rateLimitCode).toBe("RATE_LIMIT_TPM");
    expect(ctx.abortReason).toMatch(/backend unavailable/);
  });
});
