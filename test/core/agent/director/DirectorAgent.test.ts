import { describe, it, expect, vi } from "vitest";
import { configureContextStorage } from "../../../../src/core/o11y/O11yContext.js";
import { NodeContextStorageAdapter } from "../../../../src/adapter/infra/NodeContextStorageAdapter.js";
configureContextStorage(new NodeContextStorageAdapter());
import { DirectorAgent } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../../src/port/agent/AgentFactory.js";

import type { SkillRegistry } from "../../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../../src/core/agent/director/HumanReviewGateway.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";

const createMockModel = (): ChatModelPort => ({
  generate: vi.fn().mockResolvedValue({
    message: ChatMessage.text("assistant", "bot", JSON.stringify({ planId: "p1", subTasks: [] })),
    inputTokenCount: 10,
    outputTokenCount: 20,
    finishReason: "stop",
  }),
  stream: vi.fn().mockImplementation(async function* () {
    yield {
      message: ChatMessage.text("assistant", "bot", "chunk"),
      inputTokenCount: 0,
      outputTokenCount: 0,
      finishReason: null,
    };
  }),
  getModelName: vi.fn().mockReturnValue("mock-model"),
  getProvider: vi.fn().mockReturnValue("mock"),
});

const createMockAgentFactory = (): AgentFactory => ({
  createAgent: vi.fn().mockReturnValue({
    getDescriptor: vi.fn(),
    getName: vi.fn().mockReturnValue("MockAgent"),
    process: vi.fn().mockResolvedValue({
      agentName: "MockAgent",
      message: ChatMessage.text("assistant", "MockAgent", "Done"),
      metadata: {},
      success: true,
      errorMessage: null,
    }),
  }),
});

const createMockSkillRegistry = (): SkillRegistry => ({
  register: vi.fn(),
  matchSkill: vi.fn().mockReturnValue(null),
  getAll: vi.fn().mockReturnValue([]),
});

const createMockHITL = (): HumanReviewGateway => ({
  isEnabled: vi.fn().mockReturnValue(false),
  isReviewPointEnabled: vi.fn().mockReturnValue(false),
  requestReview: vi.fn().mockResolvedValue({ decision: "approved" }),
  getMaxRevisionRounds: vi.fn().mockReturnValue(3),
});

describe("DirectorAgent", () => {
  it("query 模式应直接返回模型响应", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute("Hello", "sid-1", "query", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("design 模式应执行完整流程", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute("设计战斗系统", "sid-1", "design", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("table 模式应路由到 design 流程", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute("生成配表", "sid-1", "table", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });
});
