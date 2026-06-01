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

describe("Integration: DESIGN Flow", () => {
  it("应执行完整的 design 流程", async () => {
    const model = new MockModelAdapter([
      ChatMessage.text("assistant", "mock", JSON.stringify({
        planId: "plan-1",
        subTasks: [
          { id: "T1", fragmentId: "F1", domain: "system_design", description: "设计核心系统", dependencies: [], priority: 1 },
        ],
      })),
      ChatMessage.text("assistant", "mock", JSON.stringify([
        { fragmentId: "F1", domain: "system_design", agentName: "SystemDesigner", assignment: "设计核心系统", priority: 1 },
      ])),
    ]);

    const toolRegistry = { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() };
    const skillRegistry = new SkillManager();
    const hitl = new MockHumanReviewGateway(true);

    const director = new DirectorAgent({
      model,
      agentFactory: new MockAgentFactory(),
      toolRegistry,
      skillRegistry,
      humanReviewGateway: hitl,
      hooks: [],
    });

    const response = await director.execute("设计一个RPG游戏的核心系统", "session-1", "design", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });
});
