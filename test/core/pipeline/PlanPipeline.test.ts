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
    expect(callbacks).toEqual(["start:A", "result:A", "result:B"]);
    expect(results.find((result) => result.taskId === "B")).toMatchObject({
      status: "skipped",
      errorMessage: expect.stringContaining("A"),
    });
  });

  it("HITL-2 pending 结果应中断剩余层且不标记 skipped（resume 后重新执行）", async () => {
    const calls: string[] = [];
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
      { id: "C", fragmentId: "F3", domain: "qa", description: "C", dependencies: ["B"], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task) => {
      calls.push(task.id);
      if (task.id === "A") {
        return {
          taskId: "A",
          domain: task.domain,
          status: "pending",
          output: "产出等待人工审阅",
          errorMessage: null,
          checkpointId: "cp-2-a",
          reviewPoint: "hitl-2-agent-output",
          resumeCursor: "after_task:A",
        };
      }
      return {
        taskId: task.id,
        domain: task.domain,
        status: "success",
        output: "ok",
        errorMessage: null,
      };
    });

    const results = await pipeline.execute();

    // 仅 A 被执行；B/C 不执行且不出现在结果中（不标记 skipped）
    expect(calls).toEqual(["A"]);
    expect(results.map((r) => r.taskId)).toEqual(["A"]);
    expect(results[0]).toMatchObject({ status: "pending", checkpointId: "cp-2-a" });
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

  it("层间取消应保留已完成任务并标记未开始为 cancelled", async () => {
    const root = new AbortController();
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
      { id: "B", fragmentId: "F2", domain: "combat_design", description: "B", dependencies: ["A"], priority: 1 },
      { id: "C", fragmentId: "F3", domain: "gameplay_design", description: "C", dependencies: ["A"], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task) => ({
      taskId: task.id,
      domain: task.domain,
      status: "success",
      output: task.id,
      errorMessage: null,
    }), {
      signal: root.signal,
      onTaskResult: async (task, result) => {
        if (task.id === "A" && result.status === "success") {
          root.abort(new DOMException("cancelled", "AbortError"));
        }
      },
    });

    const results = await pipeline.execute();

    expect(results.filter((r) => r.status === "success").map((r) => r.taskId)).toEqual(["A"]);
    expect(results.filter((r) => r.status === "cancelled").map((r) => r.taskId).sort()).toEqual(["B", "C"]);
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

  it("in-flight 取消应尽量回收 partial output", async () => {
    const root = new AbortController();
    const plan = createPlan([
      { id: "A", fragmentId: "F1", domain: "system_design", description: "A", dependencies: [], priority: 1 },
    ]);
    const pipeline = new PlanPipeline(plan, async (task, taskSignal) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      root.abort(new DOMException("cancelled", "AbortError"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (taskSignal?.aborted) {
        return {
          taskId: task.id,
          domain: task.domain,
          status: "cancelled",
          output: "partial from agent",
          errorMessage: "Task cancelled by user",
          errorClass: "cancelled",
        };
      }
      return {
        taskId: task.id,
        domain: task.domain,
        status: "success",
        output: "full",
        errorMessage: null,
      };
    }, root.signal);

    const results = await pipeline.execute();

    expect(results[0]).toMatchObject({
      taskId: "A",
      status: "cancelled",
      output: "partial from agent",
    });
  });
});
