import { describe, expect, test } from "vitest";
import { TokenBudgetHook } from "../../../src/core/hook/TokenBudgetHook.js";
import { ToolLoopDetectorHook } from "../../../src/core/hook/ToolLoopDetectorHook.js";
import { hashToolCall, stableStringify } from "../../../src/core/guard/hash.js";
import { DefaultTracer } from "../../../src/core/tracing/DefaultTracer.js";
import { InMemoryTraceStore } from "../../../src/core/tracing/InMemoryTraceStore.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";
import type { ContextStoragePort } from "../../../src/port/infra/ContextStoragePort.js";
import type { IdGeneratorPort } from "../../../src/port/infra/IdGeneratorPort.js";
import type { TraceRuntimeState } from "../../../src/port/tracing/TracerPort.js";

class FakeIds implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

class MemoryContext<T> implements ContextStoragePort<T> {
  private store: T | undefined;
  run<R>(next: T, callback: () => R): R {
    const prev = this.store;
    this.store = next;
    try {
      const result = callback();
      if (result != null && typeof (result as { then?: unknown }).then === "function") {
        return (Promise.resolve(result) as Promise<unknown>).finally(() => {
          this.store = prev;
        }) as R;
      }
      this.store = prev;
      return result;
    } catch (error) {
      this.store = prev;
      throw error;
    }
  }
  getStore(): T | undefined {
    return this.store;
  }
  enterWith(next: T): void {
    this.store = next;
  }
}

describe("runtime guards", () => {
  test("stableStringify is key-order independent for hashing", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(hashToolCall("wiki_read", { pagePath: "a" })).toBe(
      hashToolCall("wiki_read", { pagePath: "a" }),
    );
  });

  test("TokenBudgetHook aborts when per-trace budget is exceeded", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TokenBudgetHook({ budget: 100, tracer });

    const handle = await tracer.startTrace({
      sessionId: "s1",
      userId: "u1",
      name: "director.query",
    });

    await tracer.withTrace(handle, async () => {
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({ inputTokenCount: 60, outputTokenCount: 50 }),
      );
      expect(hook.getUsed(handle.traceId)).toBe(110);

      const next = await hook.onEvent("pre_reasoning", HookContext.create({}));
      expect(next.abort).toBe(true);
      expect(next.abortReason).toMatch(/token budget exceeded/i);

      await tracer.endTrace(handle.traceId, "error");
    });

    const detail = await store.getTrace("u1", handle.traceId);
    expect(detail!.spans.some((s) => s.name === "guard.token_budget")).toBe(true);
  });

  test("ToolLoopDetectorHook fail-loud stops identical tool+params repeats", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new ToolLoopDetectorHook({
      windowSize: 5,
      maxRepeats: 3,
      tracer,
    });

    const handle = await tracer.startTrace({
      sessionId: "s1",
      userId: "u1",
      name: "director.query",
    });

    await tracer.withTrace(handle, async () => {
      const args = { pagePath: "combat.md" };
      for (let i = 0; i < 2; i++) {
        const ctx = await hook.onEvent(
          "pre_tool_execution",
          HookContext.create({ toolName: "wiki_read", toolArguments: args }),
        );
        expect(ctx.abort).toBe(false);
      }
      const third = await hook.onEvent(
        "pre_tool_execution",
        HookContext.create({ toolName: "wiki_read", toolArguments: args }),
      );
      expect(third.abort).toBe(true);
      expect(third.abortReason).toMatch(/Tool loop detected/);
      await tracer.endTrace(handle.traceId, "error");
    });

    const detail = await store.getTrace("u1", handle.traceId);
    expect(detail!.spans.some((s) => s.name === "guard.tool_loop")).toBe(true);
  });
});
