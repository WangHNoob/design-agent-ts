import { describe, expect, test, vi } from "vitest";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { LangGraphAgentFactory } from "../../../src/adapter/langgraph/LangGraphAgentFactory.js";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import { LangGraphAgentAdapter } from "../../../src/adapter/langgraph/LangGraphAgentAdapter.js";
import { ContextManagementHook } from "../../../src/core/hook/ContextManagementHook.js";
import { SlidingWindowMemoryPort } from "../../../src/core/memory/SlidingWindowMemoryPort.js";
import { SessionToolRegistry } from "../../../src/core/tool/SessionToolRegistry.js";
import type { ToolRegistry } from "../../../src/port/tool/ToolRegistry.js";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => {
    const mockResponse = {
      content: "ok",
      _getType: () => "ai",
      additional_kwargs: {},
      tool_calls: undefined,
      concat() { return this; },
      usage_metadata: { input_tokens: 1, output_tokens: 1 },
      response_metadata: { finish_reason: "stop" },
    };
    const mockStream = async function* () { yield mockResponse; };
    return {
      modelName: "gpt-4o",
      invoke: vi.fn().mockResolvedValue(mockResponse),
      stream: vi.fn().mockReturnValue(mockStream()),
      bindTools: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue(mockResponse),
        stream: vi.fn().mockReturnValue(mockStream()),
      }),
    };
  }),
}));

describe("LangGraphAgentFactory memory wiring", () => {
  const descriptor: AgentDescriptor = {
    name: "MemAgent",
    systemPrompt: "test",
    maxIterations: 2,
    toolNames: [],
    options: {},
  };

  test("createAgent 把 memory 交给 adapter，且 ContextManagementHook 绑定同一 memory", async () => {
    const model = new LangGraphModelAdapter({
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "test",
    });
    const factory = new LangGraphAgentFactory(model);
    const registry: ToolRegistry = {
      register: vi.fn(),
      getToolDescriptors: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(undefined),
      executeTool: vi.fn(),
    };
    const memory = new SlidingWindowMemoryPort({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const sharedHook = new ContextManagementHook({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });

    const agent = factory.createAgent(descriptor, registry, memory, [sharedHook]);
    expect(agent).toBeInstanceOf(LangGraphAgentAdapter);
    const adapter = agent as LangGraphAgentAdapter;
    expect(adapter.getMemory()).toBe(memory);

    const bound = adapter.getHooks().find((h) => h instanceof ContextManagementHook) as ContextManagementHook;
    expect(bound).toBeTruthy();
    expect(bound).not.toBe(sharedHook);

    // Trigger eviction via process (addMessage + maybeCompress + pre_reasoning)
    for (let i = 0; i < 6; i++) {
      memory.addMessage(ChatMessage.text("user", "user", `p-${i}`));
    }
    await memory.maybeCompress(memory.getMessages());
    expect(memory.listArchive().length).toBeGreaterThanOrEqual(1);
    expect(bound.listArchive().length).toBeGreaterThanOrEqual(1);
  });

  test("SessionToolRegistry 路径同样持有 memory", () => {
    const model = new LangGraphModelAdapter({
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "test",
    });
    const factory = new LangGraphAgentFactory(model);
    const base: ToolRegistry = {
      register: vi.fn(),
      getToolDescriptors: vi.fn().mockReturnValue([]),
      getTool: vi.fn().mockReturnValue(undefined),
      executeTool: vi.fn(),
    };
    const sessionRegistry = new SessionToolRegistry(base, []);
    const memory = new SlidingWindowMemoryPort();
    const agent = factory.createAgent(descriptor, sessionRegistry, memory, []) as LangGraphAgentAdapter;
    expect(agent.getMemory()).toBe(memory);
  });
});
