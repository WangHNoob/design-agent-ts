import { describe, expect, it } from "vitest";
import { TaskPlanner } from "../../../src/core/agent/director/TaskPlanner.js";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import type { ModelResponse } from "../../../src/port/model/ModelResponse.js";
import type { SubTask, TaskPlan } from "../../../src/core/schema/TaskPlan.js";

function mockModel(json: string): ChatModelPort {
  return {
    async generate(): Promise<ModelResponse> {
      return {
        message: ChatMessage.text("assistant", "planner", json),
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

describe("TaskPlanner allowedTools", () => {
  it("LLM 规划保留 allowedTools（含空数组）", async () => {
    const planner = new TaskPlanner(mockModel(JSON.stringify({
      planId: "p1",
      subTasks: [
        {
          id: "T1",
          fragmentId: "T1",
          domain: "system_design",
          description: "design",
          dependencies: [],
          priority: 1,
          allowedTools: ["wiki_lookup", "grep_search"],
        },
        {
          id: "T2",
          fragmentId: "T2",
          domain: "qa",
          description: "review",
          dependencies: ["T1"],
          priority: 2,
          allowedTools: [],
        },
        {
          id: "T3",
          fragmentId: "T3",
          domain: "combat_design",
          description: "no whitelist",
          dependencies: [],
          priority: 3,
        },
      ],
    })));

    const plan = await planner.plan("req", "chief_designer", null);
    expect(plan.subTasks[0]?.allowedTools).toEqual(["wiki_lookup", "grep_search"]);
    expect(plan.subTasks[1]?.allowedTools).toEqual([]);
    expect(plan.subTasks[2]?.allowedTools).toBeUndefined();
  });

  it("merge 重建时仅透传显式 allowedTools，undefined 不固化", () => {
    const plan: TaskPlan = {
      planId: "p1",
      requirement: "r",
      subTasks: [
        {
          id: "T1",
          fragmentId: "T1",
          domain: "system_design",
          description: "old",
          dependencies: [],
          priority: 1,
          allowedTools: ["wiki_lookup"],
        },
        {
          id: "T2",
          fragmentId: "T2",
          domain: "qa",
          description: "no tools field",
          dependencies: [],
          priority: 2,
        },
      ],
    };

    const assignments = plan.subTasks.map((st) => ({
      taskId: st.id,
      domain: st.domain,
      assignment: `new:${st.id}`,
      ...(st.allowedTools !== undefined ? { allowedTools: st.allowedTools } : {}),
    }));

    const merged: TaskPlan = {
      planId: plan.planId,
      requirement: plan.requirement,
      subTasks: assignments.map((a) => {
        const originalSubTask = plan.subTasks.find(
          (st) => st.id === a.taskId || st.fragmentId === a.taskId,
        );
        const allowedTools = a.allowedTools !== undefined
          ? a.allowedTools
          : originalSubTask?.allowedTools;
        return {
          id: a.taskId,
          fragmentId: a.taskId,
          domain: a.domain,
          description: a.assignment,
          dependencies: originalSubTask?.dependencies ?? [],
          priority: originalSubTask?.priority ?? 1,
          ...(allowedTools !== undefined ? { allowedTools: [...allowedTools] } : {}),
        } satisfies SubTask;
      }),
    };

    expect(merged.subTasks[0]?.allowedTools).toEqual(["wiki_lookup"]);
    expect(merged.subTasks[1]?.allowedTools).toBeUndefined();
    expect(merged.subTasks[0]?.description).toBe("new:T1");
  });
});
