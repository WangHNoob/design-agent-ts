import { describe, expect, test } from "vitest";
import { CostAccountingHook } from "../../../src/core/hook/CostAccountingHook.js";
import { InMemoryCostStore } from "../../../src/core/cost/InMemoryCostStore.js";
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
      return callback();
    } finally {
      this.store = prev;
    }
  }
  getStore(): T | undefined {
    return this.store;
  }
  enterWith(next: T): void {
    this.store = next;
  }
}

describe("CostAccountingHook", () => {
  test("records token usage with agent attribution on post_reasoning", async () => {
    const store = new InMemoryCostStore(new FakeIds());
    const traceStore = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(traceStore, new FakeIds(), context);
    const hook = new CostAccountingHook({
      enabled: true,
      pricing: { inputPricePer1M: 2.5, outputPricePer1M: 10 },
      costStore: store,
      defaultModelName: "gpt-4o",
      tracer,
    });

    const handle = await tracer.startTrace({
      sessionId: "s1",
      userId: "u1",
      name: "director.design",
      executionId: "exec-1",
    });

    await tracer.withTrace(handle, async () => {
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({
          agentName: "CombatDesigner",
          sessionId: "s1",
          modelName: "gpt-4o",
          inputTokenCount: 1000,
          outputTokenCount: 500,
          metadata: { workflowId: "combat-design" },
        }),
      );
    });

    expect(store.all()).toHaveLength(1);
    const row = store.all()[0]!;
    expect(row.userId).toBe("u1");
    expect(row.agentName).toBe("CombatDesigner");
    expect(row.workflowId).toBe("combat-design");
    expect(row.executionId).toBe("exec-1");
    expect(row.estimatedCostMicros).toBeGreaterThan(0);
  });

  test("does not throw when cost store fails (fail-open)", async () => {
    const hook = new CostAccountingHook({
      enabled: true,
      pricing: { inputPricePer1M: 2.5, outputPricePer1M: 10 },
      costStore: {
        recordUsage: async () => {
          throw new Error("DB unavailable");
        },
        aggregate: async () => [],
        listTopSpenders: async () => [],
      },
      defaultModelName: "gpt-4o",
      resolveUserId: () => "u1",
    });

    const ctx = await hook.onEvent(
      "post_reasoning",
      HookContext.create({
        agentName: "CombatDesigner",
        inputTokenCount: 100,
        outputTokenCount: 50,
      }),
    );
    expect(ctx.abort).not.toBe(true);
  });
});
