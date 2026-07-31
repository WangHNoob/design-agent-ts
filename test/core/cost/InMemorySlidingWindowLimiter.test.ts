import { describe, expect, test } from "vitest";
import { InMemorySlidingWindowLimiter } from "../../../src/core/cost/InMemorySlidingWindowLimiter.js";

describe("InMemorySlidingWindowLimiter", () => {
  test("returns RATE_LIMIT_RPM when user RPM exceeded", async () => {
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 2,
      tpmLimitPerUser: 0,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });

    expect((await limiter.checkAndConsume({ userId: "u1", rpmDelta: 1 })).allowed).toBe(true);
    expect((await limiter.checkAndConsume({ userId: "u1", rpmDelta: 1 })).allowed).toBe(true);

    const denied = await limiter.checkAndConsume({ userId: "u1", rpmDelta: 1 });
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe("RATE_LIMIT_RPM");
    expect(denied.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  test("returns RATE_LIMIT_TPM when user TPM exceeded", async () => {
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 0,
      tpmLimitPerUser: 1000,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });

    expect((await limiter.checkAndConsume({ userId: "u1", tpmDelta: 600 })).allowed).toBe(true);
    const denied = await limiter.checkAndConsume({ userId: "u1", tpmDelta: 500 });
    expect(denied.allowed).toBe(false);
    expect(denied.code).toBe("RATE_LIMIT_TPM");
  });

  test("compartmentalizes quotas per userId", async () => {
    const limiter = new InMemorySlidingWindowLimiter({
      rpmLimitPerUser: 1,
      tpmLimitPerUser: 0,
      globalRpmLimit: 0,
      globalTpmLimit: 0,
      windowMs: 60_000,
    });

    expect((await limiter.checkAndConsume({ userId: "u1", rpmDelta: 1 })).allowed).toBe(true);
    expect((await limiter.checkAndConsume({ userId: "u2", rpmDelta: 1 })).allowed).toBe(true);
    expect((await limiter.checkAndConsume({ userId: "u1", rpmDelta: 1 })).allowed).toBe(false);
  });
});
