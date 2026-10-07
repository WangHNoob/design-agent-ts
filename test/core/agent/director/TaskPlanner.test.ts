import { describe, it, expect, vi } from "vitest";
import { TaskPlanner } from "../../../../src/core/agent/director/TaskPlanner.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";

const PLAN_JSON = JSON.stringify({
  planId: "p1",
  subTasks: [
    { id: "T1", fragmentId: "F1", domain: "system_design", description: "d", dependencies: [], priority: 1 },
  ],
});

function createMockModel(): ChatModelPort {
  return {
    generate: vi.fn().mockResolvedValue({
      message: ChatMessage.text("assistant", "bot", PLAN_JSON),
      inputTokenCount: 10,
      outputTokenCount: 20,
      finishReason: "stop",
    }),
    stream: vi.fn(),
    getModelName: vi.fn(() => "mock"),
    getProvider: vi.fn(() => "mock"),
  };
}

const TEMPLATE = "Role: {role}\n{skillHint}\n{sessionContext}\n需求: {requirement}";

describe("TaskPlanner sessionContext 占位符", () => {
  it("第 4 参应替换 {sessionContext} 且不残留占位符", async () => {
    const model = createMockModel();
    const planner = new TaskPlanner(model, TEMPLATE);
    await planner.plan("设计战斗", "chief_designer", null, "## 会话背景\n【用户】历史内容");

    const prompt = JSON.stringify((model.generate as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(prompt).toContain("【用户】历史内容");
    expect(prompt).not.toContain("{sessionContext}");
    // requirement 不被污染（plan.requirement 保持短需求）
    expect(prompt).not.toContain("## 会话背景\\n需求:");
  });

  it("缺省第 4 参时占位符替换为空且无残留", async () => {
    const model = createMockModel();
    const planner = new TaskPlanner(model, TEMPLATE);
    await planner.plan("设计战斗", "chief_designer", null);

    const prompt = JSON.stringify((model.generate as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(prompt).not.toContain("{sessionContext}");
    expect(prompt).toContain("需求: 设计战斗");
  });
});
