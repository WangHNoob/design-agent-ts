import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../../src/port/agent/AgentFactory.js";
import type { SkillRegistry } from "../../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../../src/core/agent/director/HumanReviewGateway.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import type { DirectorDeps } from "../../../../src/core/agent/director/DirectorAgent.js";

const createMockModel = (): ChatModelPort => ({
  generate: vi.fn(),
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

function createQueryAgentFactory(processStream = vi.fn(async function* () {
  yield {
    agentName: "QueryAgent",
    message: ChatMessage.text("assistant", "QueryAgent", "LLM answer"),
    metadata: {},
    success: true,
    errorMessage: null,
  };
})) {
  const createAgent = vi.fn(() => ({
    getDescriptor: vi.fn(),
    getName: vi.fn(() => "QueryAgent"),
    process: vi.fn(),
    processStream,
  }));
  return { createAgent, processStream, agentFactory: { createAgent } as AgentFactory };
}

function createDirector(
  agentFactory: AgentFactory,
  faqFastPath?: DirectorDeps["faqFastPath"],
) {
  return new DirectorAgent({
    model: createMockModel(),
    agentFactory,
    toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
    skillRegistry: createMockSkillRegistry(),
    humanReviewGateway: createMockHITL(),
    hooks: [],
    faqFastPath,
  });
}

describe("DirectorAgent FAQ fast-path", () => {
  it("hit skips LLM and emits faq_hit + complete.source=faq", async () => {
    const { createAgent, agentFactory } = createQueryAgentFactory();
    const match = vi.fn().mockResolvedValue({
      hit: true,
      score: 0.95,
      answer: "标准答",
      faqId: "f1",
      question: "标准问",
    });
    const director = createDirector(agentFactory, {
      enabled: true,
      threshold: 0.85,
      match,
    });

    const events = [];
    for await (const event of director.executeStream("用户问题", "sid-faq-hit", "query", "chief_designer")) {
      events.push(event);
    }

    expect(match).toHaveBeenCalledWith("用户问题");
    expect(createAgent).not.toHaveBeenCalled();
    expect(events.map((e) => e.type)).toEqual(["start", "faq_hit", "chunk", "complete"]);
    expect(events[1]?.data).toEqual({
      score: 0.95,
      faqId: "f1",
      question: "标准问",
    });
    expect(events[2]?.data.text).toBe("标准答");
    expect(events[3]?.data).toEqual({
      success: true,
      output: "标准答",
      source: "faq",
    });
  });

  it("miss falls back to normal query agent", async () => {
    const { createAgent, processStream, agentFactory } = createQueryAgentFactory();
    const match = vi.fn().mockResolvedValue({
      hit: true,
      score: 0.7,
      answer: "低分答",
    });
    const director = createDirector(agentFactory, {
      enabled: true,
      threshold: 0.85,
      match,
    });

    const events = [];
    for await (const event of director.executeStream("用户问题", "sid-faq-miss", "query", "chief_designer")) {
      events.push(event);
    }

    expect(match).toHaveBeenCalledWith("用户问题");
    expect(createAgent).toHaveBeenCalled();
    expect(processStream).toHaveBeenCalled();
    expect(events.some((e) => e.type === "faq_hit")).toBe(false);
    expect(events.at(-1)?.data.output).toBe("LLM answer");
    expect(events.at(-1)?.data.source).toBeUndefined();
  });

  it("match throw falls back without surfacing error to client", async () => {
    const { createAgent, processStream, agentFactory } = createQueryAgentFactory();
    const match = vi.fn().mockRejectedValue(new Error("MCP timeout"));
    const director = createDirector(agentFactory, {
      enabled: true,
      threshold: 0.85,
      match,
    });

    const events = [];
    for await (const event of director.executeStream("用户问题", "sid-faq-err", "query", "chief_designer")) {
      events.push(event);
    }

    expect(createAgent).toHaveBeenCalled();
    expect(processStream).toHaveBeenCalled();
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "faq_hit")).toBe(false);
    expect(events.at(-1)?.type).toBe("complete");
  });

  it("disabled skips FAQ match entirely", async () => {
    const { createAgent, processStream, agentFactory } = createQueryAgentFactory();
    const match = vi.fn();
    const director = createDirector(agentFactory, {
      enabled: false,
      threshold: 0.85,
      match,
    });

    const events = [];
    for await (const event of director.executeStream("用户问题", "sid-faq-off", "query", "chief_designer")) {
      events.push(event);
    }

    expect(match).not.toHaveBeenCalled();
    expect(createAgent).toHaveBeenCalled();
    expect(processStream).toHaveBeenCalled();
    expect(events.some((e) => e.type === "faq_hit")).toBe(false);
  });
});
