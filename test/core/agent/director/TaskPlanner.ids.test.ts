import { describe, it, expect, vi } from "vitest";
import { TaskPlanner } from "../../../../src/core/agent/director/TaskPlanner.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import type { ChatModelPort } from "../../../../port/model/ChatModelPort.js";

const TEMPLATE = "Role: {role}\n{skillHint}{sessionContext}\n需求: {requirement}";

function plannerResponding(planJson: string) {
  const model: ChatModelPort = {
    generate: vi.fn().mockResolvedValue({
      message: ChatMessage.text("assistant", "bot", planJson),
      inputTokenCount: 10,
      outputTokenCount: 20,
      finishReason: "stop",
    }),
    stream: vi.fn(),
    getModelName: vi.fn(() => "mock"),
    getProvider: vi.fn(() => "mock"),
  };
  return { model, planner: new TaskPlanner(model, TEMPLATE) };
}

describe("TaskPlanner 代码分配任务序号（LLM 编号不进入执行链路）", () => {
  it("LLM 发明的 id/fragmentId 被重写为 F 序列，依赖重写到同一命名空间", async () => {
    const planJson = JSON.stringify({
      planId: "p1",
      subTasks: [
        { id: "task-abc", fragmentId: "F9", domain: "gameplay_design", description: "审计", dependencies: [], priority: 1 },
        { id: "task-def", fragmentId: "F9", domain: "combat_design", description: "平衡", dependencies: ["task-abc"], priority: 2 },
        { id: "task-ghi", domain: "qa", description: "验证", dependencies: ["task-abc", "task-def"], priority: 3 },
      ],
    });
    const { planner } = plannerResponding(planJson);
    const plan = await planner.plan("上线新角色", "chief_designer", null);

    expect(plan.subTasks.map((t) => t.id)).toEqual(["F1", "F2", "F3"]);
    expect(plan.subTasks.every((t) => t.fragmentId === t.id)).toBe(true);
    expect(plan.subTasks[1].dependencies).toEqual(["F1"]);
    expect(plan.subTasks[2].dependencies).toEqual(["F1", "F2"]);
  });

  it("引用计划外任务的孤立依赖被丢弃并告警，不影响其余任务", async () => {
    const planJson = JSON.stringify({
      planId: "p1",
      subTasks: [
        { id: "T1", fragmentId: "F1", domain: "system_design", description: "a", dependencies: ["ghost"], priority: 1 },
        { id: "T2", fragmentId: "F2", domain: "system_design", description: "b", dependencies: ["T1"], priority: 2 },
      ],
    });
    const { planner } = plannerResponding(planJson);
    const plan = await planner.plan("需求", "chief_designer", null);

    expect(plan.subTasks[0].id).toBe("F1");
    expect(plan.subTasks[0].dependencies).toEqual([]);
    expect(plan.subTasks[1].dependencies).toEqual(["F1"]);
  });
});
