import { describe, expect, test } from "vitest";
import { InflightLimiter } from "../../../src/core/execution/InflightLimiter.js";

describe("InflightLimiter", () => {
  test("tryAcquire respects per-lane caps and release frees a slot", () => {
    const limiter = new InflightLimiter({ query: 2, design: 1 });
    expect(limiter.tryAcquire("query")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(false);
    expect(limiter.tryAcquire("design")).toBe(true);
    expect(limiter.tryAcquire("design")).toBe(false);
    expect(limiter.counts()).toEqual({ query: 2, design: 1 });
    limiter.release("query");
    expect(limiter.tryAcquire("query")).toBe(true);
  });

  test("table lane uses query cap", () => {
    const limiter = new InflightLimiter({ query: 1, design: 1 });
    expect(limiter.tryAcquire("table")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(false);
  });
});
