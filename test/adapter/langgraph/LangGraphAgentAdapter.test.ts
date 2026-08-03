import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => {
    const mockResponse = {
      content: "Response",
      _getType: () => "ai",
      additional_kwargs: {},
      tool_calls: undefined,
      concat(other: unknown) { return this; },
    };
    const mockStream = async function* () {
      yield mockResponse;
    };
    return {
      modelName: "gpt-4o",
      invoke: vi.fn().mockResolvedValue({
        content: "Hello",
        _getType: () => "ai",
        additional_kwargs: {},
        usage_metadata: { input_tokens: 10, output_tokens: 5 },
        response_metadata: { finish_reason: "stop" },
      }),
      stream: vi.fn().mockReturnValue(mockStream()),
      bindTools: vi.fn().mockReturnValue({
        invoke: vi.fn().mockResolvedValue(mockResponse),
        stream: vi.fn().mockReturnValue(mockStream()),
      }),
    };
  }),
}));

import { LangGraphAgentAdapter } from "../../../src/adapter/langgraph/LangGraphAgentAdapter.js";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import { SystemMessage } from "@langchain/core/messages";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { CancellationHook } from "../../../src/core/hook/CancellationHook.js";
import type { AgentHook } from "../../../src/port/hook/AgentHook.js";

describe("LangGraphAgentAdapter", () => {
  const createModel = () => new LangGraphModelAdapter({
    provider: "openai",
    modelName: "gpt-4o",
    apiKey: "test",
  });

  const descriptor: AgentDescriptor = {
    name: "TestAgent",
    systemPrompt: "You are a test agent",
    maxIterations: 5,
    toolNames: [],
    options: {},
  };

  it("应实现 AgentPort 接口", () => {
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);
    expect(adapter.getName()).toBe("TestAgent");
    expect(adapter.getDescriptor()).toBe(descriptor);
  });

  it("process 应返回 AgentResponse", async () => {
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);
    const response = await adapter.process("session-1", [
      ChatMessage.text("user", "user", "Hello"),
    ]);

    expect(response.agentName).toBe("TestAgent");
    expect(response.success).toBe(true);
  });

  it("process 在 signal 已 abort 时不应返回 success", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);
    const response = await adapter.process("session-1", [
      ChatMessage.text("user", "user", "Hello"),
    ], { signal: controller.signal });

    expect(response.success).toBe(false);
    expect(response.metadata?.aborted).toBe(true);
  });

  it("process 在 pre_reasoning abort 时不应返回 success", async () => {
    const abortHook: AgentHook = {
      onEvent: async (point, ctx) => {
        if (point === "pre_reasoning") {
          return { ...ctx, abort: true, abortReason: "CANCELLED" };
        }
        return ctx;
      },
    };
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), [abortHook]);
    const response = await adapter.process("session-1", [
      ChatMessage.text("user", "user", "Hello"),
    ]);

    expect(response.success).toBe(false);
    expect(response.metadata?.aborted).toBe(true);
  });

  it("process 在 pre_reasoning CancellationHook abort 时不应返回 success", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new LangGraphAgentAdapter(
      descriptor,
      [],
      createModel(),
      [new CancellationHook()],
    );
    const response = await adapter.process("session-1", [
      ChatMessage.text("user", "user", "Hello"),
    ], { signal: controller.signal });

    expect(response.success).toBe(false);
    expect(response.metadata?.aborted).toBe(true);
  });

  it("历史中包含 system 消息时，LLM 调用只保留首条 system（修复非首位 system 报错）", async () => {
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);
    const model = (
      adapter as unknown as { modelAdapter: { getLangChainModel(): { bindTools: ReturnType<typeof vi.fn> } } }
    ).modelAdapter.getLangChainModel();

    // 模拟长会话压缩后产生的归档摘要 system 消息 + MemoryInjectionHook 注入
    const response = await adapter.process("session-1", [
      ChatMessage.text("system", "archive", "[上下文归档 #archive-1] 已摘要 2 条较早消息：……"),
      ChatMessage.text("user", "user", "继续设计"),
    ]);

    expect(response.success).toBe(true);

    const bindTools = model.bindTools;
    expect(bindTools.mock.calls.length).toBeGreaterThan(0);
    const bound = bindTools.mock.results[0].value as { stream: ReturnType<typeof vi.fn> };
    const streamCall = bound.stream.mock.calls[0];
    const msgs = streamCall[0] as unknown[];

    // 第一条是 descriptor.systemPrompt 对应的 SystemMessage
    expect(msgs[0]).toBeInstanceOf(SystemMessage);
    // 其余任何消息都不得是 SystemMessage（Anthropic/OpenAI 只允许首位 system）
    for (const m of msgs.slice(1)) {
      expect(m).not.toBeInstanceOf(SystemMessage);
    }
  });
});
