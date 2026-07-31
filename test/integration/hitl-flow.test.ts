import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import { MockModelAdapter } from "../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentFactory } from "../../src/adapter/mock/MockAgentFactory.js";
import { MockHumanReviewGateway } from "../../src/adapter/mock/MockHumanReviewGateway.js";
import { SkillManager } from "../../src/core/skill/SkillManager.js";
import { ChatMessage } from "../../src/port/message/ChatMessage.js";

describe("Integration: HITL Flow", () => {
  it("HITL 拒绝时应返回 rejected 状态", async () => {
    const model = new MockModelAdapter([
      ChatMessage.text("assistant", "mock", JSON.stringify({ planId: "p1", subTasks: [] })),
      ChatMessage.text("assistant", "mock", "[]"),
    ]);

    const hitl = new MockHumanReviewGateway(false); // auto-reject

    const director = new DirectorAgent({
      model,
      agentFactory: new MockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: new SkillManager(),
      humanReviewGateway: hitl,
      hooks: [],
    });

    const response = await director.execute("测试 HITL", "session-1", "design", "chief_designer");
    expect(response.success).toBe(false);
    expect(response.errorMessage).toBe("Mock rejection");
    expect(response.metadata?.rejected).toBe(true);
  });
});
