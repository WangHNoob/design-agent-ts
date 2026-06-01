import { describe, it, expect, vi } from "vitest";
import { configureContextStorage } from "../../src/core/o11y/O11yContext.js";
import { NodeContextStorageAdapter } from "../../src/adapter/infra/NodeContextStorageAdapter.js";
configureContextStorage(new NodeContextStorageAdapter());
import { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import { MockModelAdapter } from "../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentFactory } from "../../src/adapter/mock/MockAgentFactory.js";
import { MockHumanReviewGateway } from "../../src/adapter/mock/MockHumanReviewGateway.js";
import { SkillManager } from "../../src/core/skill/SkillManager.js";
import { ChatMessage } from "../../src/port/message/ChatMessage.js";

describe("Integration: QUERY Flow", () => {
  it("应通过 QueryAgent 返回模型响应", async () => {
    const model = new MockModelAdapter([]);
    const agentFactory = new MockAgentFactory();
    agentFactory.setPresetResponse("QueryAgent", {
      agentName: "QueryAgent",
      message: ChatMessage.text("assistant", "QueryAgent", "RPG游戏的核心系统包括角色成长、装备系统和任务系统。"),
      metadata: {},
      success: true,
      errorMessage: null,
    });

    const director = new DirectorAgent({
      model,
      agentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: new SkillManager(),
      humanReviewGateway: new MockHumanReviewGateway(),
      hooks: [],
    });

    const response = await director.execute("什么是RPG的核心系统？", "session-1", "query", "chief_designer");
    expect(response.success).toBe(true);
    expect(ChatMessage.textContent(response.message!)).toContain("RPG");
  });
});
