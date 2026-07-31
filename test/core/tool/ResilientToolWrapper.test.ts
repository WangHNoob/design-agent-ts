import { describe, expect, test, vi } from "vitest";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import { ResilientToolWrapper } from "../../../src/core/tool/ResilientToolWrapper.js";
import { ToolCircuitRegistry } from "../../../src/core/resilience/ToolCircuitRegistry.js";
import { ToolFastFailError } from "../../../src/core/tool/ToolFastFailError.js";
import { CircuitBreaker } from "../../../src/core/resilience/CircuitBreaker.js";

function mockTool(
  name: string,
  impl: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult,
): ToolPort {
  return {
    getDescriptor(): ToolDescriptor {
      return { name, description: name, parameters: {} };
    },
    async execute(args) {
      return impl(args);
    },
  };
}

describe("CircuitBreaker (shared)", () => {
  test("opens after threshold and recovers after cooldown", () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 50,
      now: () => now,
    });
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
    expect(breaker.allow()).toBe(false);
    now += 50;
    expect(breaker.getState()).toBe("half_open");
    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });
});

describe("ResilientToolWrapper", () => {
  test("retry then return_to_llm after exhaustion", async () => {
    let calls = 0;
    const base = mockTool("flaky", async () => {
      calls += 1;
      return ToolResult.error("boom");
    });
    const sleep = vi.fn(async () => {});
    const wrapped = new ResilientToolWrapper(base, {
      policy: {
        onError: "retry",
        maxRetries: 2,
        retryBackoffMs: 10,
        onRetryExhausted: "return_to_llm",
      },
      sleep,
    });

    const result = await wrapped.execute({});
    expect(calls).toBe(3); // initial + 2 retries
    expect(result.isError).toBe(true);
    expect(result.metadata.failureDecision).toBe("return_to_llm");
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test("return_to_llm without retry", async () => {
    let calls = 0;
    const base = mockTool("local", async () => {
      calls += 1;
      return ToolResult.error("bad args");
    });
    const wrapped = new ResilientToolWrapper(base, {
      policy: { onError: "return_to_llm" },
    });
    const result = await wrapped.execute({});
    expect(calls).toBe(1);
    expect(result.metadata.failureDecision).toBe("return_to_llm");
  });

  test("degrade to fallback tool", async () => {
    const primary = mockTool("primary", async () => ToolResult.error("down"));
    const fallback = mockTool("fallback", async () => ToolResult.success("ok-from-fallback"));
    const wrapped = new ResilientToolWrapper(primary, {
      policy: { onError: "degrade", degradeTo: "fallback" },
      resolveTool: (name) => (name === "fallback" ? fallback : undefined),
    });
    const result = await wrapped.execute({ q: 1 });
    expect(result.isError).toBe(false);
    expect(result.output).toBe("ok-from-fallback");
    expect(result.metadata.failureDecision).toBe("degrade");
    expect(result.metadata.degradedFrom).toBe("primary");
  });

  test("fast_fail throws ToolFastFailError", async () => {
    const base = mockTool("critical", async () => ToolResult.error("auth failed"));
    const wrapped = new ResilientToolWrapper(base, {
      policy: { onError: "fast_fail" },
    });
    await expect(wrapped.execute({})).rejects.toBeInstanceOf(ToolFastFailError);
  });

  test("external circuit opens and short-circuits with tool_unavailable", async () => {
    let calls = 0;
    const base = mockTool("tavily_search", async () => {
      calls += 1;
      return ToolResult.error("timeout");
    });
    const registry = new ToolCircuitRegistry({ failureThreshold: 2, cooldownMs: 60_000 });
    const wrapped = new ResilientToolWrapper(base, {
      external: true,
      circuitRegistry: registry,
      policy: { onError: "return_to_llm" },
    });

    await wrapped.execute({});
    await wrapped.execute({});
    expect(registry.getState("tavily_search")).toBe("open");

    const short = await wrapped.execute({});
    expect(calls).toBe(2); // third call does not hit base
    expect(short.output).toContain("[tool_unavailable]");
    expect(short.metadata.circuitShortCircuit).toBe(true);
  });

  test("timeout treats as failure and returns to LLM", async () => {
    const base = mockTool("slow", async () => {
      await new Promise((r) => setTimeout(r, 50));
      return ToolResult.success("late");
    });
    const wrapped = new ResilientToolWrapper(base, {
      timeoutMs: 5,
      policy: { onError: "return_to_llm" },
    });
    const result = await wrapped.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toMatch(/timed out/i);
  });
});
