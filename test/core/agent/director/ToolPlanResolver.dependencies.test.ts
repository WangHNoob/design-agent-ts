import { describe, it, expect, vi } from "vitest";
import { ToolPlanResolver, type ToolPlanResolverCtx } from "../../../../src/core/agent/director/ToolPlanResolver.js";
import type { TaskPlan, SubTask } from "../../../../src/core/schema/TaskPlan.js";
import type { LoggerPort } from "../../../../src/port/infra/LoggerPort.js";
import type { AgentDescriptor } from "../../../../src/port/agent/AgentDescriptor.js";

const descriptor: AgentDescriptor = {
  name: "GameplayDesigner",
  systemPrompt: "test",
  toolNames: [],
  maxIterations: 1,
  options: {},
};

const createLogger = (): LoggerPort & { warns: string[] } => {
  const warns: string[] = [];
  return {
    warns,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn((m: string) => warns.push(m)),
    error: vi.fn(),
  };
};

const createResolver = (logger: LoggerPort): ToolPlanResolver =>
  new ToolPlanResolver({
    logger,
    skillCtx: {
      getAgentDescriptor: vi.fn().mockReturnValue(descriptor),
    },
  } as unknown as ToolPlanResolverCtx);

/** LLM 规划输出形态：id（T*）与 fragmentId（F*）双命名空间，deps 写在 T 命名空间。 */
const llmPlan: TaskPlan = {
  planId: "p1",
  requirement: "req",
  subTasks: [
    { id: "T1", fragmentId: "F1", domain: "gameplay_design", description: "d1", dependencies: [], priority: 1 },
    { id: "T2", fragmentId: "F2", domain: "gameplay_design", description: "d2", dependencies: ["T1"], priority: 1 },
    { id: "T3", fragmentId: "F3", domain: "combat_design", description: "d3", dependencies: ["T1", "T2"], priority: 2 },
  ],
};

describe("ToolPlanResolver dependency namespace translation", () => {
  it("buildMergedExecutablePlan 把 T 命名空间依赖翻译为可执行计划的任务 ID（F 命名空间）", () => {
    const resolver = createResolver(createLogger());
    const merged = resolver.buildMergedExecutablePlan(
      llmPlan,
      llmPlan.subTasks.map((st: SubTask) => ({
        taskId: st.fragmentId,
        domain: st.domain,
        assignment: st.description,
        agentDescriptor: descriptor,
      })),
      "req",
    );

    expect(merged.subTasks.map((t) => t.id)).toEqual(["F1", "F2", "F3"]);
    expect(merged.subTasks[1].dependencies).toEqual(["F1"]);
    expect(merged.subTasks[2].dependencies).toEqual(["F1", "F2"]);
  });

  it("已是可执行命名空间（fragmentId）的依赖保持不变（幂等）", () => {
    const resolver = createResolver(createLogger());
    const merged = resolver.buildMergedExecutablePlan(
      llmPlan,
      [{
        taskId: "F3",
        domain: "combat_design",
        assignment: "d3",
        agentDescriptor: descriptor,
        dependencies: ["F1", "F2"],
      }],
      "req",
    );
    expect(merged.subTasks[0].dependencies).toEqual(["F1", "F2"]);
  });

  it("计划内任务引用计划外依赖时保留原值（交由 PlanPipeline 对完整计划检测上报）", () => {
    const logger = createLogger();
    const resolver = createResolver(logger);
    const badPlan: TaskPlan = {
      planId: "p3",
      requirement: "req",
      subTasks: [
        { id: "T1", fragmentId: "F1", domain: "gameplay_design", description: "d1", dependencies: ["T9"], priority: 1 },
      ],
    };
    const merged = resolver.buildMergedExecutablePlan(
      badPlan,
      [{
        taskId: "F1",
        domain: "gameplay_design",
        assignment: "d1",
        agentDescriptor: descriptor,
      }],
      "req",
    );
    expect(merged.subTasks[0].dependencies).toEqual(["T9"]);
  });

  it("计划外任务（重规划分片）依赖指向已完成任务时不告警、保留原值", () => {
    const logger = createLogger();
    const resolver = createResolver(logger);
    const fragmentPlan: TaskPlan = {
      planId: "p4",
      requirement: "req",
      subTasks: [
        { id: "R1", fragmentId: "R1", domain: "combat_design", description: "retry", dependencies: ["F1"], priority: 1 },
      ],
    };
    const merged = resolver.buildMergedExecutablePlan(
      fragmentPlan,
      [{
        taskId: "R1",
        domain: "combat_design",
        assignment: "retry",
        agentDescriptor: descriptor,
      }],
      "req",
    );
    expect(merged.subTasks[0].dependencies).toEqual(["F1"]);
    expect(logger.warns).toHaveLength(0);
  });

  it("工作流计划（fragmentId === id）依赖保持原样", () => {
    const workflowPlan: TaskPlan = {
      planId: "p2",
      requirement: "req",
      skillId: "s1",
      subTasks: [
        { id: "TASK-001", fragmentId: "TASK-001", domain: "system_design", description: "a", dependencies: [], priority: 1 },
        { id: "TASK-002", fragmentId: "TASK-002", domain: "system_design", description: "b", dependencies: ["TASK-001"], priority: 1 },
      ],
    };
    const resolver = createResolver(createLogger());
    const merged = resolver.buildMergedExecutablePlan(
      workflowPlan,
      [{
        taskId: "TASK-002",
        domain: "system_design",
        assignment: "b",
        agentDescriptor: descriptor,
      }],
      "req",
    );
    expect(merged.subTasks[0].dependencies).toEqual(["TASK-001"]);
  });

  it("mapRoutingToAssignments 产出的 assignment.dependencies 同样翻译为可执行命名空间", () => {
    const resolver = createResolver(createLogger());
    const assignments = resolver.mapRoutingToAssignments(llmPlan, [
      { fragmentId: "F3", domain: "combat_design", agentName: "CombatDesigner", assignment: "d3", priority: 2 },
    ]);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].taskId).toBe("F3");
    expect(assignments[0].dependencies).toEqual(["F1", "F2"]);
  });
});
