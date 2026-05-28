import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    modelName: "gpt-4o",
    invoke: vi.fn().mockResolvedValue({
      content: "Hello",
      _getType: () => "ai",
      additional_kwargs: {},
      usage_metadata: { input_tokens: 10, output_tokens: 5 },
      response_metadata: { finish_reason: "stop" },
    }),
    stream: vi.fn(),
    bindTools: vi.fn().mockReturnValue({
      invoke: vi.fn().mockResolvedValue({
        content: "Response",
        _getType: () => "ai",
        additional_kwargs: {},
        tool_calls: undefined,
      }),
    }),
  })),
}));

import { ChatOpenAI } from "@langchain/openai";
import { LangGraphAgentAdapter } from "../../../src/adapter/langgraph/LangGraphAgentAdapter.js";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";

describe("LangGraphAgentAdapter", () => {
  const createModel = () => new ChatOpenAI({ modelName: "gpt-4o", openAIApiKey: "test" });

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
});
