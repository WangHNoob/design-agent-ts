import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    modelName: "gpt-4o",
    invoke: vi.fn(),
    stream: vi.fn(),
    bindTools: vi.fn().mockReturnValue({ invoke: vi.fn(), stream: vi.fn() }),
  })),
}));


import { LangGraphAgentFactory } from "../../../src/adapter/langgraph/LangGraphAgentFactory.js";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import type { ToolRegistry } from "../../../src/port/tool/ToolRegistry.js";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";
import type { MemoryPort } from "../../../src/port/memory/MemoryPort.js";

describe("LangGraphAgentFactory", () => {
  const createModel = () => new LangGraphModelAdapter({
    provider: "openai",
    modelName: "gpt-4o",
    apiKey: "test-key",
  });

  const createMockRegistry = (): ToolRegistry => ({
    register: vi.fn(),
    getToolDescriptors: vi.fn().mockReturnValue([]),
    getTool: vi.fn().mockReturnValue(undefined),
    executeTool: vi.fn(),
    sessionScoped: false,
  });

  const createMockMemory = (): MemoryPort => ({
    addMessage: vi.fn(),
    getMessages: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    maybeCompress: vi.fn().mockImplementation(async (msgs) => msgs),
  });

  it("同名 Agent 应返回缓存实例", () => {
    const model = createModel();
    const factory = new LangGraphAgentFactory(model);
    const registry = createMockRegistry();
    const memory = createMockMemory();

    const descriptor: AgentDescriptor = {
      name: "TestAgent",
      systemPrompt: "You are a test agent",
      maxIterations: 5,
      toolNames: [],
      options: {},
    };

    const agent1 = factory.createAgent(descriptor, registry, memory, []);
    const agent2 = factory.createAgent(descriptor, registry, memory, []);
    expect(agent1).toBe(agent2);
  });

  it("sessionScoped registry 不缓存：每次返回新实例（工具绑定各自会话）", () => {
    const model = createModel();
    const factory = new LangGraphAgentFactory(model);
    const memory = createMockMemory();

    const descriptor: AgentDescriptor = {
      name: "QAPlanner",
      systemPrompt: "test",
      maxIterations: 5,
      toolNames: [],
      options: {},
    };

    const sessionRegistryA: ToolRegistry = { ...createMockRegistry(), sessionScoped: true };
    const sessionRegistryB: ToolRegistry = { ...createMockRegistry(), sessionScoped: true };

    const agentA = factory.createAgent(descriptor, sessionRegistryA, memory, []);
    const agentB = factory.createAgent(descriptor, sessionRegistryB, memory, []);
    expect(agentA).not.toBe(agentB);

    // 同一 registry 重复调用也不复用（每次工具集都可能是新会话）
    const agentA2 = factory.createAgent(descriptor, sessionRegistryA, memory, []);
    expect(agentA2).not.toBe(agentA);
  });

  it("包装层（CachingToolRegistry 类装饰）透传内层 sessionScoped 判定", () => {
    const model = createModel();
    const factory = new LangGraphAgentFactory(model);
    const memory = createMockMemory();

    const descriptor: AgentDescriptor = {
      name: "SystemDesigner",
      systemPrompt: "test",
      maxIterations: 5,
      toolNames: [],
      options: {},
    };

    // 模拟黑板开启：session registry 外再包一层装饰 registry
    const inner: ToolRegistry = { ...createMockRegistry(), sessionScoped: true };
    const wrapped: ToolRegistry = {
      ...createMockRegistry(),
      get sessionScoped() {
        return inner.sessionScoped;
      },
      getTool: (name: string) => inner.getTool(name),
    };

    const agent1 = factory.createAgent(descriptor, wrapped, memory, []);
    const agent2 = factory.createAgent(descriptor, wrapped, memory, []);
    expect(agent1).not.toBe(agent2);
  });

  it("工具未注册时应静默跳过", () => {
    const model = createModel();
    const factory = new LangGraphAgentFactory(model);
    const registry = createMockRegistry();
    const memory = createMockMemory();

    const descriptor: AgentDescriptor = {
      name: "AgentWithMissingTools",
      systemPrompt: "test",
      maxIterations: 5,
      toolNames: ["non_existent_tool"],
      options: {},
    };

    const agent = factory.createAgent(descriptor, registry, memory, []);
    expect(agent.getName()).toBe("AgentWithMissingTools");
  });
});
