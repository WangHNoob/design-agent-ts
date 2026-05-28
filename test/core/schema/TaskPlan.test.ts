import { describe, it, expect } from "vitest";
import type { TaskPlan, SubTask, Domain } from "../../../src/core/schema/TaskPlan.js";

describe("TaskPlan Schema", () => {
  it("Domain 类型应接受预定义值", () => {
    const domains: Domain[] = [
      "system_design",
      "combat_design",
      "numerical_planning",
      "gameplay_design",
      "executive_planning",
      "qa",
    ];
    expect(domains).toHaveLength(6);
  });

  it("SubTask 应支持依赖关系", () => {
    const task: SubTask = {
      id: "T001",
      fragmentId: "F001",
      domain: "system_design",
      description: "设计核心系统",
      dependencies: ["T000"],
      priority: 1,
    };
    expect(task.dependencies).toContain("T000");
  });

  it("TaskPlan 应包含子任务列表", () => {
    const plan: TaskPlan = {
      planId: "PLAN-001",
      requirement: "设计战斗系统",
      subTasks: [
        {
          id: "T001",
          fragmentId: "F001",
          domain: "combat_design",
          description: "设计战斗机制",
          dependencies: [],
          priority: 1,
        },
        {
          id: "T002",
          fragmentId: "F002",
          domain: "numerical_planning",
          description: "设计数值平衡",
          dependencies: ["T001"],
          priority: 2,
        },
      ],
    };
    expect(plan.subTasks).toHaveLength(2);
    expect(plan.subTasks[1].dependencies).toContain("T001");
  });
});
