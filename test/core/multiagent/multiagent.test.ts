import { describe, expect, test } from "vitest";
import {
  AgentCallGuard,
  AgentInvokeTool,
  invokeSubAgent,
  MultiAgentGuardError,
  isMultiAgentGuardError,
  runFanOutBatches,
  distillHandoff,
  validateHandoff,
  HandoffViolationError,
  isHandoffViolationError,
  seedHandoffsFromResults,
  collectHandoffsForPrompt,
  formatHandoffForPrompt,
} from "../../../src/core/multiagent/index.js";
import { TokenBudgetHook } from "../../../src/core/hook/TokenBudgetHook.js";
import { PlanPipeline } from "../../../src/core/pipeline/PlanPipeline.js";
import type { TaskPlan, SubTask } from "../../../src/core/schema/TaskPlan.js";
import type { TaskResult } from "../../../src/core/schema/TaskResult.js";
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

describe("AgentCallGuard", () => {
  test("detects call cycle A→B→A", () => {
    const guard = new AgentCallGuard({ maxDepth: 5, detectCycles: true });
    const a = guard.root("A");
    const b = guard.enter("B", a);
    expect(() => guard.enter("A", b)).toThrow(MultiAgentGuardError);
  });

  test("rejects depth beyond maxDepth", () => {
    const guard = new AgentCallGuard({ maxDepth: 2, detectCycles: true });
    const root = guard.root("Director");
    const a = guard.enter("AgentA", root);
    const b = guard.enter("AgentB", a);
    expect(b.depth).toBe(2);
    expect(() => guard.enter("AgentC", b)).toThrow(/max_depth/);
  });

  test("invokeSubAgent nests under parent without mutating siblings", async () => {
    const guard = new AgentCallGuard({ maxDepth: 3, detectCycles: true });
    const root = guard.root();
    const seen: string[] = [];
    await Promise.all([
      invokeSubAgent(guard, root, "Combat", async (ctx) => {
        seen.push(ctx.path.join(">"));
        return 1;
      }),
      invokeSubAgent(guard, root, "System", async (ctx) => {
        seen.push(ctx.path.join(">"));
        return 2;
      }),
    ]);
    expect(seen).toContain("Director>Combat");
    expect(seen).toContain("Director>System");
  });
});

describe("AgentInvokeTool production path", () => {
  test("A→B→A via invoke_agent throws MultiAgentGuardError call_cycle", async () => {
    const guard = new AgentCallGuard({ maxDepth: 5, detectCycles: true });
    const root = guard.root("Director");
    let active = guard.enter("SystemDesigner", root);
    const violations: string[] = [];

    const tool = new AgentInvokeTool({
      guard,
      getParent: () => active,
      allowedAgentNames: ["SystemDesigner", "CombatDesigner"],
      onGuardViolation: (err) => {
        violations.push(err.code);
      },
      runNested: async ({ agentName, callParent }) => {
        const prev = active;
        active = callParent;
        try {
          if (agentName === "CombatDesigner") {
            const nested = new AgentInvokeTool({
              guard,
              getParent: () => active,
              allowedAgentNames: ["SystemDesigner", "CombatDesigner"],
              onGuardViolation: (err) => {
                violations.push(err.code);
              },
              runNested: async () => "should-not-run",
            });
            await nested.execute({
              agentName: "SystemDesigner",
              assignment: "loop back",
            });
          }
          return `ok:${agentName}`;
        } finally {
          active = prev;
        }
      },
    });

    await expect(
      tool.execute({ agentName: "CombatDesigner", assignment: "help" }),
    ).rejects.toMatchObject({ name: "MultiAgentGuardError", code: "call_cycle" });
    expect(violations).toContain("call_cycle");
  });

  test("depth exceeded via nested invoke_agent", async () => {
    const guard = new AgentCallGuard({ maxDepth: 2, detectCycles: true });
    const root = guard.root("Director");
    let active = guard.enter("SystemDesigner", root);

    const makeTool = (): AgentInvokeTool =>
      new AgentInvokeTool({
        guard,
        getParent: () => active,
        allowedAgentNames: ["CombatDesigner", "GameplayDesigner", "QAPlanner"],
        runNested: async ({ agentName, callParent }) => {
          const prev = active;
          active = callParent;
          try {
            if (agentName === "CombatDesigner") {
              await makeTool().execute({
                agentName: "GameplayDesigner",
                assignment: "too deep",
              });
            }
            return `ok:${agentName}`;
          } finally {
            active = prev;
          }
        },
      });

    await expect(
      makeTool().execute({ agentName: "CombatDesigner", assignment: "nest" }),
    ).rejects.toMatchObject({ name: "MultiAgentGuardError", code: "max_depth" });
  });
});

describe("FanOutLimiter / PlanPipeline batching", () => {
  test("runFanOutBatches splits 10 items with max=3", async () => {
    const batches: number[] = [];
    const items = Array.from({ length: 10 }, (_, i) => i);
    const results = await runFanOutBatches(
      items,
      3,
      async (batch) => batch.map((n) => n * 2),
      (info) => {
        batches.push(info.batchSize);
      },
    );
    expect(results).toEqual(items.map((n) => n * 2));
    expect(batches).toEqual([3, 3, 3, 1]);
  });

  test("PlanPipeline batches layer of 10 with maxFanOut=3 and runs all", async () => {
    const concurrencyPeaks: number[] = [];
    let inFlight = 0;
    const batchAudits: number[] = [];

    const tasks: SubTask[] = Array.from({ length: 10 }, (_, i) => ({
      id: `T${i}`,
      fragmentId: `F${i}`,
      domain: "system_design" as const,
      description: `task ${i}`,
      dependencies: [],
      priority: 1,
    }));
    const plan: TaskPlan = {
      planId: "fanout",
      requirement: "test",
      subTasks: tasks,
    };

    const pipeline = new PlanPipeline(plan, async (task) => {
      inFlight += 1;
      concurrencyPeaks.push(inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return {
        taskId: task.id,
        domain: task.domain,
        status: "success",
        output: task.id,
        errorMessage: null,
      };
    }, {
      maxFanOut: 3,
      onFanOutBatch: (info) => {
        batchAudits.push(info.batchSize);
      },
    });

    const results = await pipeline.execute();
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.status === "success")).toBe(true);
    expect(Math.max(...concurrencyPeaks)).toBeLessThanOrEqual(3);
    expect(batchAudits.reduce((a, b) => a + b, 0)).toBe(10);
  });

  test("maxFanOut<=0 runs all tasks in one batch without dropping", async () => {
    const tasks: SubTask[] = Array.from({ length: 5 }, (_, i) => ({
      id: `U${i}`,
      fragmentId: `G${i}`,
      domain: "system_design" as const,
      description: `task ${i}`,
      dependencies: [],
      priority: 1,
    }));
    const plan: TaskPlan = { planId: "unlimited", requirement: "t", subTasks: tasks };
    let batches = 0;
    const pipeline = new PlanPipeline(plan, async (task) => ({
      taskId: task.id,
      domain: task.domain,
      status: "success" as const,
      output: task.id,
      errorMessage: null,
    }), {
      maxFanOut: 0,
      onFanOutBatch: () => {
        batches += 1;
      },
    });
    const results = await pipeline.execute();
    expect(results).toHaveLength(5);
    expect(batches).toBe(0);
    expect(results.map((r) => r.taskId).sort()).toEqual(["U0", "U1", "U2", "U3", "U4"]);
  });
});

describe("Handoff", () => {
  test("validateHandoff rejects oversized summary", () => {
    expect(() =>
      validateHandoff(
        {
          taskId: "t1",
          domain: "combat_design",
          summary: "x".repeat(101),
          keyPoints: ["a"],
          schemaVersion: "1",
        },
        { maxChars: 100, maxKeyPoints: 5 },
      ),
    ).toThrow(HandoffViolationError);
  });

  test("validateHandoff rejects too many keyPoints", () => {
    expect(() =>
      validateHandoff(
        {
          taskId: "t1",
          domain: "combat_design",
          summary: "ok",
          keyPoints: ["a", "b", "c", "d"],
          schemaVersion: "1",
        },
        { maxChars: 4000, maxKeyPoints: 3 },
      ),
    ).toThrow(/keyPoints/);
  });

  test("distillHandoff respects handoffMaxChars", () => {
    const huge = `# Title\n\n${"段落内容。".repeat(500)}\n\n- 要点一\n- 要点二`;
    const payload = distillHandoff({
      taskId: "t1",
      domain: "system_design",
      output: huge,
      limits: { maxChars: 200, maxKeyPoints: 12 },
    });
    expect(payload.summary.length).toBeLessThanOrEqual(201);
    expect(payload.truncated).toBe(true);
    validateHandoff(payload, { maxChars: 200, maxKeyPoints: 12 });
  });

  test("resume invalid handoff is rejected then re-distilled from output", () => {
    const limits = { maxChars: 80, maxKeyPoints: 4 };
    const violations: string[] = [];
    const results: TaskResult[] = [
      {
        taskId: "t1",
        domain: "combat_design",
        status: "success",
        output: "# 战斗\n\n合理结论。\n\n- 要点A\n- 要点B",
        errorMessage: null,
        handoff: {
          taskId: "t1",
          domain: "combat_design",
          summary: "x".repeat(200),
          keyPoints: ["a"],
          schemaVersion: "1",
        },
      },
    ];
    const map = seedHandoffsFromResults(results, limits, (info) => {
      violations.push(info.source);
    });
    expect(violations).toContain("resume");
    expect(map.has("t1")).toBe(true);
    validateHandoff(map.get("t1")!, limits);
  });

  test("multi-predecessor total chars truncates later handoffs", () => {
    const handoffs = [
      {
        taskId: "a",
        domain: "system_design",
        summary: "AAAA",
        keyPoints: ["1"],
        schemaVersion: "1" as const,
      },
      {
        taskId: "b",
        domain: "combat_design",
        summary: "BBBB",
        keyPoints: ["2"],
        schemaVersion: "1" as const,
      },
      {
        taskId: "c",
        domain: "qa",
        summary: "CCCC",
        keyPoints: ["3"],
        schemaVersion: "1" as const,
      },
    ];
    const firstLen = formatHandoffForPrompt(handoffs[0]!).length;
    const collected = collectHandoffsForPrompt(handoffs, firstLen + 10);
    expect(collected.truncatedAtIndex).toBe(1);
    expect(collected.sections.some((s) => s.includes("总量上限"))).toBe(true);
    expect(collected.sections.join("\n")).not.toContain("### c ");
  });
});

describe("Multi-agent token budget", () => {
  test("accumulates across two sub-agent post_reasoning and aborts with multi-agent span", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TokenBudgetHook({
      budget: 10_000,
      multiAgentBudget: 100,
      multiAgentEnabled: true,
      tracer,
    });

    const handle = await tracer.startTrace({
      sessionId: "s1",
      userId: "u1",
      name: "director.design",
    });

    await tracer.withTrace(handle, async () => {
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({ inputTokenCount: 60, outputTokenCount: 10 }),
      );
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({ inputTokenCount: 40, outputTokenCount: 5 }),
      );
      expect(hook.getUsed(handle.traceId)).toBe(115);

      const next = await hook.onEvent("pre_reasoning", HookContext.create({}));
      expect(next.abort).toBe(true);
      expect(next.metadata.multiAgentTokenBudgetExceeded).toBe(true);

      await tracer.endTrace(handle.traceId, "error");
      hook.clear(handle.traceId);
      expect(hook.getUsed(handle.traceId)).toBe(0);
    });

    const detail = await store.getTrace("u1", handle.traceId);
    expect(detail!.spans.some((s) => s.name === "guard.multi_agent_token_budget")).toBe(true);
  });

  test("refcount keeps accumulator until outermost post_agent_call", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TokenBudgetHook({ budget: 1000, tracer });
    const handle = await tracer.startTrace({
      sessionId: "s1",
      userId: "u1",
      name: "director.design",
    });

    await tracer.withTrace(handle, async () => {
      await hook.onEvent("pre_agent_call", HookContext.create({}));
      await hook.onEvent("pre_agent_call", HookContext.create({}));
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({ inputTokenCount: 10, outputTokenCount: 5 }),
      );
      await hook.onEvent("post_agent_call", HookContext.create({}));
      expect(hook.getUsed(handle.traceId)).toBe(15);
      await hook.onEvent("post_agent_call", HookContext.create({}));
      expect(hook.getUsed(handle.traceId)).toBe(0);
      await tracer.endTrace(handle.traceId, "ok");
    });
  });
});
