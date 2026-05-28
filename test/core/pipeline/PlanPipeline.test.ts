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
});
