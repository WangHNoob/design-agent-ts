import { describe, it, expect, vi } from "vitest";
import { Router } from "../../../../src/core/agent/director/Router.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import type { TaskPlan } from "../../../../src/core/schema/TaskPlan.js";

function routerResponding(routingJson: string) {
  const model: ChatModelPort = {
    generate: vi.fn().mockResolvedValue({
      message: ChatMessage.text("assistant", "bot", routingJson),
      inputTokenCount: 10,
      outputTokenCount: 20,
      finishReason: "stop",
    }),
    stream: vi.fn(),
    getModelName: vi.fn(() => "mock"),
    getProvider: vi.fn(() => "mock"),
  };
  return { model, router: new Router(model) };
}

const plan: TaskPlan = {
  planId: "p1",
  requirement: "req",
  subTasks: [
    { id: "F1", fragmentId: "F1", domain: "gameplay_design", description: "审计", dependencies: [], priority: 1 },
    { id: "F2", fragmentId: "F2", domain: "combat_design", description: "平衡", dependencies: ["F1"], priority: 2 },
    { id: "F3", fragmentId: "F3", domain: "qa", description: "验证", dependencies: ["F1", "F2"], priority: 3 },
  ],
};

describe("Router：fragmentId 由代码按位置键控（不采信 LLM 编号）", () => {
  it("LLM 不输出 fragmentId 时按位置补齐", async () => {
    const routing = JSON.stringify([
      { domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "审计", priority: 1 },
      { domain: "combat_design", agentName: "CombatDesigner", assignment: "平衡", priority: 2 },
      { domain: "qa", agentName: "QAPlanner", assignment: "验证", priority: 3 },
    ]);
    const { router } = routerResponding(routing);
    const decisions = await router.route(plan, "chief_designer");
    expect(decisions.map((d) => d.fragmentId)).toEqual(["F1", "F2", "F3"]);
    expect(decisions.map((d) => d.agentName)).toEqual(["GameplayDesigner", "CombatDesigner", "QAPlanner"]);
  });

  it("LLM 输出错误/重复编号（如全部 F1）时被代码重写为正确任务序号", async () => {
    const routing = JSON.stringify([
      { fragmentId: "F1", domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "审计", priority: 1 },
      { fragmentId: "F1", domain: "combat_design", agentName: "CombatDesigner", assignment: "平衡", priority: 2 },
      { fragmentId: "F1", domain: "qa", agentName: "QAPlanner", assignment: "验证", priority: 3 },
    ]);
    const { router } = routerResponding(routing);
    const decisions = await router.route(plan, "chief_designer");
    expect(decisions.map((d) => d.fragmentId)).toEqual(["F1", "F2", "F3"]);
  });

  it("决策数与任务数不符（LLM 丢任务）时整体退化为确定性路由", async () => {
    const routing = JSON.stringify([
      { domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "审计", priority: 1 },
    ]);
    const { router } = routerResponding(routing);
    const decisions = await router.route(plan, "chief_designer");
    // 确定性路由按 domain→agent 覆盖全部 3 个任务
    expect(decisions.map((d) => d.fragmentId)).toEqual(["F1", "F2", "F3"]);
    expect(decisions.map((d) => d.agentName)).toEqual(["GameplayDesigner", "CombatDesigner", "QAPlanner"]);
  });
});
