import { describe, it, expect } from "vitest";
import { PlanPipeline } from "../../../src/core/pipeline/PlanPipeline.js";
import type { TaskPlan, SubTask } from "../../../src/core/schema/TaskPlan.js";

describe("PlanPipeline", () => {
  const createPlan = (tasks: SubTask[]): TaskPlan => ({
    planId: "test",
    requirement: "test requirement",
    subTasks: tasks,
  });

  it("无依赖任务应并发执行", async () => {
    const order: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: [], priority: 1 },
    ]);

    const pipeline = new PlanPipeline(plan, async (task) => {
      order.push(task.id);
      return { taskId: task.id, domain: task.domain, status: "success", output: task.id, errorMessage: null };
    });

    const results = await pipeline.execute();
    expect(results).toHaveLength(2);
    expect(pipeline.getLayers()).toHaveLength(1);
  });

  it("有依赖任务应按顺序执行", async () => {
    const order: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
    ]);

    const pipeline = new PlanPipeline(plan, async (task) => {
      order.push(task.id);
      return { taskId: task.id, domain: task.domain, status: "success", output: task.id, errorMessage: null };
    });

    await pipeline.execute();
    expect(order).toEqual(["A", "B"]);
    expect(pipeline.getLayers()).toHaveLength(2);
  });

  it("拓扑排序应正确划分层级", () => {
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
      { id: "C", fragmentId: "F3", domain: "gameplay_design", description: "C", dependencies: ["A"], priority: 1 },
      { id: "D", fragmentId: "F4", domain: "qa", description: "D", dependencies: ["B", "C"], priority: 1 },
    ]);

    const pipeline = new PlanPipeline(plan, async (task) =>
      ({ taskId: task.id, domain: task.domain, status: "success", output: task.id, errorMessage: null })
    );

    const layers = pipeline.getLayers();
    expect(layers[0]).toContain("A");
    expect(layers[1]).toContain("B");
    expect(layers[1]).toContain("C");
    expect(layers[2]).toContain("D");
  });

  it("前驱失败时后继应 skipped 且不调用 executor", async () => {
    const calls: string[] = [];
    const callbacks: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task) => {
      calls.push(task.id);
      return {
        taskId: task.id,
        domain: task.domain,
        status: "error",
        output: "",
        errorMessage: "failed",
      };
    }, {
      onTaskStart: async (task) => callbacks.push(`start:${task.id}`),
      onTaskResult: async (task) => callbacks.push(`result:${task.id}`),
    });

    const results = await pipeline.execute();

    expect(calls).toEqual(["A"]);
    expect(callbacks).toEqual(["start:A", "result:A"]);
    expect(results.find((result) => result.taskId === "B")).toMatchObject({
      status: "skipped",
      errorMessage: expect.stringContaining("A"),
    });
  });

  it("同层单项 throw 不应妨碍其他任务结果收集", async () => {
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: [], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task) => {
      if (task.id === "A") throw new Error("boom");
      return { taskId: task.id, domain: task.domain, status: "success", output: "ok", errorMessage: null };
    });

    const results = await pipeline.execute();

    expect(results).toEqual([
      expect.objectContaining({ taskId: "A", status: "error", errorMessage: "boom" }),
      expect.objectContaining({ taskId: "B", status: "success" }),
    ]);
  });

  it("根 signal 取消应传递到任务并取消未开始任务", async () => {
    const root = new AbortController();
    const calls: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task, taskSignal) => {
      calls.push(task.id);
      expect(taskSignal).toBeDefined();
      root.abort(new DOMException("cancelled", "AbortError"));
      await new Promise((_resolve, reject) => {
        taskSignal?.addEventListener("abort", () => reject(taskSignal.reason), { once: true });
      });
      throw new Error("unreachable");
    }, root.signal);

    const results = await pipeline.execute();

    expect(calls).toEqual(["A"]);
    expect(results).toEqual([
      expect.objectContaining({ taskId: "A", status: "cancelled" }),
      expect.objectContaining({ taskId: "B", status: "cancelled" }),
    ]);
  });

  it("任务超时应中止 task signal 并返回结构化 error", async () => {
    let observedSignal: AbortSignal | undefined;
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (_task, taskSignal) => {
      observedSignal = taskSignal;
      return new Promise(() => {});
    }, { taskTimeoutMs: 5 });

    const results = await pipeline.execute();

    expect(observedSignal?.aborted).toBe(true);
    expect(results[0]).toMatchObject({
      taskId: "A",
      status: "error",
      errorMessage: expect.stringContaining("timed out"),
    });
  });

  it("async callbacks 应按 start/result 顺序等待", async () => {
    const events: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task) => {
      events.push(`execute:${task.id}`);
      return { taskId: task.id, domain: task.domain, status: "success", output: "ok", errorMessage: null };
    }, {
      onTaskStart: async (task) => {
        await Promise.resolve();
        events.push(`start:${task.id}`);
      },
      onTaskResult: async (task) => {
        await Promise.resolve();
        events.push(`result:${task.id}`);
      },
    });

    await pipeline.execute();

    expect(events).toEqual(["start:A", "execute:A", "result:A"]);
  });

  it("未知依赖应在构造时明确抛错", () => {
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: ["missing"], priority: 1 },
    ]);

    expect(() => new PlanPipeline(plan, async (task) => ({
      taskId: task.id,
      domain: task.domain,
      status: "success",
      output: "",
      errorMessage: null,
    }))).toThrow("Task A has unknown dependencies: missing");
  });

  it("依赖环应在构造时抛错", () => {
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: ["B"], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
    ]);

    expect(() => new PlanPipeline(plan, async (task) => ({
      taskId: task.id,
      domain: task.domain,
      status: "success",
      output: "",
      errorMessage: null,
    }))).toThrow("Dependency cycle detected");
  });
});
