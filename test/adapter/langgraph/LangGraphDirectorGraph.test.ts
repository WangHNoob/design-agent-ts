import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    modelName: "gpt-4o",
    invoke: vi.fn().mockResolvedValue({
      content: "result",
      _getType: () => "ai",
      additional_kwargs: {},
    }),
    stream: vi.fn(),
    bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }),
  })),
}));


import { LangGraphDirectorGraph } from "../../../src/adapter/langgraph/LangGraphDirectorGraph.js";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import type { AgentFactory } from "../../../src/port/agent/AgentFactory.js";
import type { ToolRegistry } from "../../../src/port/tool/ToolRegistry.js";
import type { SkillRegistry } from "../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../src/core/agent/director/HumanReviewGateway.js";

describe("LangGraphDirectorGraph", () => {
  const createDeps = () => {
    const model = new LangGraphModelAdapter({
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "test",
    });

    const agentFactory: AgentFactory = {
      createAgent: vi.fn(),
    };

    const toolRegistry: ToolRegistry = {
      register: vi.fn(),
      getToolDescriptors: vi.fn().mockReturnValue([]),
      getTool: vi.fn(),
      executeTool: vi.fn(),
    };

    const skillRegistry: SkillRegistry = {
      register: vi.fn(),
      matchSkill: vi.fn().mockReturnValue(null),
      getAll: vi.fn().mockReturnValue([]),
    };

    const humanReviewGateway: HumanReviewGateway = {
      isEnabled: vi.fn().mockReturnValue(false),
      isReviewPointEnabled: vi.fn().mockReturnValue(false),
      requestReview: vi.fn().mockResolvedValue({ decision: "approved" }),
      getMaxRevisionRounds: vi.fn().mockReturnValue(3),
    };

    return { model, agentFactory, toolRegistry, skillRegistry, humanReviewGateway };
  };

  it("应成功构建 graph", () => {
    const graph = new LangGraphDirectorGraph();
    const deps = createDeps();
    const compiled = graph.buildGraph(deps);
    expect(compiled).toBeDefined();
  });
});
