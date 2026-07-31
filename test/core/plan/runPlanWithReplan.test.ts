import { describe, expect, it, vi } from "vitest";
import { runPlanWithReplan } from "../../../src/core/plan/runPlanWithReplan.js";
import { PlanReplanner } from "../../../src/core/plan/PlanReplanner.js";
import { PlanViolationError } from "../../../src/core/plan/PlanViolationError.js";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import type { ModelResponse } from "../../../src/port/model/ModelResponse.js";
import type { TaskPlan } from "../../../src/core/schema/TaskPlan.js";

function mockReplanModel(payloads: string[]): ChatModelPort {
  let i = 0;
  return {
    async generate(): Promise<ModelResponse> {
      const text = payloads[Math.min(i, payloads.length - 1)] ?? "[]";
      i += 1;
      return {
        message: ChatMessage.text("assistant", "replanner", text),
        inputTokenCount: 1,
        outputTokenCount: 1,
        finishReason: "stop",
      };
    },
    async *stream() {
      yield await this.generate([]);
    },
    getModelName() { return "mock"; },
    getProvider() { return "mock"; },
    reconfigure() {},
  };
}

describe("runPlanWithReplan", () => {
  it("超过 maxReplans 时 exhausted=true", async () => {
    const plan: TaskPlan = {
      planId: "p",
      requirement: "r",
      subTasks: [
        {
          id: "A",
          fragmentId: "A",
          domain: "system_design",
          description: "always fail",
          dependencies: [],
          priority: 1,
          allowedTools: ["wiki_lookup"],
        },
      ],
    };

    const replanJson = JSON.stringify([
      {
        id: "A2",
        fragmentId: "A2",
        domain: "system_design",
        description: "retry",
        dependencies: [],
        priority: 1,
        allowedTools: ["wiki_lookup"],
      },
    ]);

    const replanner = new PlanReplanner(mockReplanModel([replanJson, replanJson, replanJson]));
    const audits: string[] = [];

    const result = await runPlanWithReplan({
      plan,
      enabled: true,
      maxReplans: 2,
      replanner,
      onAudit: async (name) => { audits.push(name); },
      executor: async (task) => ({
        taskId: task.id,
        domain: task.domain,
        status: "error",
        output: "",
        errorMessage: "boom",
      }),
    });

    expect(result.exhausted).toBe(true);
    expect(result.replanCount).toBe(2);
    expect(audits).toContain("plan.replan");
    expect(audits).toContain("plan.replan_exhausted");
    expect(result.results.some((r) => r.status === "error")).toBe(true);
  });

  it("maxReplans=0 时不重规划", async () => {
    const plan: TaskPlan = {
      planId: "p",
      requirement: "r",
      subTasks: [
        {
          id: "A",
          fragmentId: "A",
          domain: "system_design",
          description: "fail",
          dependencies: [],
          priority: 1,
        },
      ],
    };

    const replanSpy = vi.fn();
    const replanner = new PlanReplanner(mockReplanModel(["[]"]));
    replanner.replanRemaining = replanSpy;

    const result = await runPlanWithReplan({
      plan,
      enabled: true,
      maxReplans: 0,
      replanner,
      executor: async (task) => ({
        taskId: task.id,
        domain: task.domain,
        status: "error",
        output: "",
        errorMessage: "boom",
      }),
    });

    expect(result.exhausted).toBe(true);
    expect(result.replanCount).toBe(0);
    expect(replanSpy).not.toHaveBeenCalled();
  });

  it("A 成功 + B 失败后重规划，A 的 executor 仍只调用 1 次", async () => {
    const plan: TaskPlan = {
      planId: "p",
      requirement: "r",
      subTasks: [
        {
          id: "A",
          fragmentId: "A",
          domain: "system_design",
          description: "ok",
          dependencies: [],
          priority: 1,
        },
        {
          id: "B",
          fragmentId: "B",
          domain: "combat_design",
          description: "fail once",
          dependencies: ["A"],
          priority: 2,
        },
      ],
    };

    const calls: string[] = [];
    let bAttempts = 0;
    const replanJson = JSON.stringify([
      {
        id: "B2",
        fragmentId: "B2",
        domain: "combat_design",
        description: "retry B",
        dependencies: ["A"],
        priority: 2,
      },
    ]);
    const replanner = new PlanReplanner(mockReplanModel([replanJson]));

    const result = await runPlanWithReplan({
      plan,
      enabled: true,
      maxReplans: 2,
      replanner,
      executor: async (task) => {
        calls.push(task.id);
        if (task.id === "A") {
          return {
            taskId: "A",
            domain: task.domain,
            status: "success",
            output: "done",
            errorMessage: null,
          };
        }
        if (task.id === "B") {
          bAttempts += 1;
          return {
            taskId: "B",
            domain: task.domain,
            status: "error",
            output: "",
            errorMessage: "B failed",
          };
        }
        // B2 after replan
        return {
          taskId: task.id,
          domain: task.domain,
          status: "success",
          output: "ok",
          errorMessage: null,
        };
      },
    });

    expect(calls.filter((id) => id === "A")).toHaveLength(1);
    expect(bAttempts).toBe(1);
    expect(calls).toContain("B2");
    expect(result.exhausted).toBe(false);
    expect(result.results.find((r) => r.taskId === "A")?.status).toBe("success");
    expect(result.results.find((r) => r.taskId === "B2")?.status).toBe("success");
  });

  it("非法 JSON / PlanViolationError 时 exhausted 且不抛未处理异常", async () => {
    const plan: TaskPlan = {
      planId: "p",
      requirement: "r",
      subTasks: [
        {
          id: "A",
          fragmentId: "A",
          domain: "system_design",
          description: "fail",
          dependencies: [],
          priority: 1,
        },
      ],
    };

    const audits: string[] = [];
    const replanner = new PlanReplanner(mockReplanModel(["not-json-at-all {{{"]));

    const result = await runPlanWithReplan({
      plan,
      enabled: true,
      maxReplans: 2,
      replanner,
      onAudit: async (name) => { audits.push(name); },
      executor: async (task) => ({
        taskId: task.id,
        domain: task.domain,
        status: "error",
        output: "",
        errorMessage: "boom",
      }),
    });

    expect(result.exhausted).toBe(true);
    expect(result.replanFailed).toBe(true);
    expect(result.replanErrorMessage).toMatch(/replan JSON parse failed|Plan violation/i);
    expect(audits).toContain("plan.replan_failed");
  });

  it("Replanner 抛 PlanViolationError 时 fail loud 不冒泡", async () => {
    const plan: TaskPlan = {
      planId: "p",
      requirement: "r",
      subTasks: [
        {
          id: "A",
          fragmentId: "A",
          domain: "system_design",
          description: "fail",
          dependencies: [],
          priority: 1,
        },
      ],
    };

    const audits: Array<{ name: string; attrs: Record<string, unknown> }> = [];
    const replanner = new PlanReplanner(mockReplanModel(["[]"]));
    replanner.replanRemaining = async () => {
      throw new PlanViolationError({
        taskId: "A",
        code: "invalid_plan",
        reason: "replan remaining tasks contain a dependency cycle",
      });
    };

    await expect(runPlanWithReplan({
      plan,
      enabled: true,
      maxReplans: 2,
      replanner,
      onAudit: async (name, attrs) => { audits.push({ name, attrs }); },
      executor: async (task) => ({
        taskId: task.id,
        domain: task.domain,
        status: "error",
        output: "",
        errorMessage: "boom",
      }),
    })).resolves.toMatchObject({
      exhausted: true,
      replanFailed: true,
    });

    expect(audits.some((a) => a.name === "plan.replan_failed")).toBe(true);
  });
});

describe("PlanReplanner normalize", () => {
  it("LLM 未输出 allowedTools 时保留 undefined", async () => {
    const replanner = new PlanReplanner(mockReplanModel([JSON.stringify([
      {
        id: "R1",
        fragmentId: "R1",
        domain: "qa",
        description: "retry",
        dependencies: [],
        priority: 1,
      },
    ])]));

    const remaining = await replanner.replanRemaining({
      originalPlan: {
        planId: "p",
        requirement: "r",
        subTasks: [
          { id: "A", fragmentId: "A", domain: "system_design", description: "a", dependencies: [], priority: 1 },
        ],
      },
      completedResults: [],
      failedTask: {
        taskId: "A",
        domain: "system_design",
        status: "error",
        output: "",
        errorMessage: "x",
      },
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.allowedTools).toBeUndefined();
  });
});
