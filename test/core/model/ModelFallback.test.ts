import { describe, expect, test } from "vitest";
import { classifyModelError } from "../../../src/core/model/classifyModelError.js";
import { ModelCircuitBreaker } from "../../../src/core/model/ModelCircuitBreaker.js";

describe("classifyModelError", () => {
  test("treats 429 and timeouts as retriable", () => {
    expect(classifyModelError(Object.assign(new Error("rate limited"), { status: 429 }))).toBe("retriable");
    expect(classifyModelError(new Error("Request timed out"))).toBe("retriable");
    expect(classifyModelError(new Error("fetch failed"))).toBe("retriable");
  });

  test("treats auth and validation as terminal", () => {
    expect(classifyModelError(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe("terminal");
    expect(classifyModelError(Object.assign(new Error("bad request"), { status: 400 }))).toBe("terminal");
    expect(classifyModelError(new Error("Aborted by user"))).toBe("terminal");
  });
});

describe("ModelCircuitBreaker", () => {
  test("opens after failure threshold and recovers after cooldown", () => {
    let now = 1_000;
    const breaker = new ModelCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 100,
      now: () => now,
    });

    expect(breaker.allow()).toBe(true);
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(breaker.allow()).toBe(false);

    now += 100;
    expect(breaker.getState()).toBe("half_open");
    expect(breaker.allow()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });
});
