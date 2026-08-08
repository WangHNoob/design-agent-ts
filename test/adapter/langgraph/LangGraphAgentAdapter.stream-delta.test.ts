import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";

const streamChunks = [
  new AIMessageChunk({ content: "a" }),
  new AIMessageChunk({ content: "b" }),
];

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => {
    const mockStream = async function* () {
      for (const chunk of streamChunks) {
        yield chunk;
      }
    };
    const mockResponse = {
      content: "ab",
      _getType: () => "ai",
      additional_kwargs: {},
      tool_calls: undefined,
      usage_metadata: { input_tokens: 1, output_tokens: 2 },
      response_metadata: { finish_reason: "stop" },
    };
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

import { LangGraphAgentAdapter } from "../../../src/adapter/langgraph/LangGraphAgentAdapter.js";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";

describe("LangGraphAgentAdapter stream deltas", () => {
  const createModel = () =>
    new LangGraphModelAdapter({
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("process 应逐 delta 调用 onTextDelta", async () => {
    const deltas: string[] = [];
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);

    const response = await adapter.process(
      "session-1",
      [ChatMessage.text("user", "user", "Hello")],
      {
        onTextDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(deltas).toEqual(["a", "b"]);
    expect(response.success).toBe(true);
    expect(ChatMessage.textContent(response.message!)).toBe("ab");
  });

  it("streamingEnabled=false 时不应调用 onTextDelta", async () => {
    const deltas: string[] = [];
    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);

    const response = await adapter.process(
      "session-1",
      [ChatMessage.text("user", "user", "Hello")],
      {
        streamingEnabled: false,
        onTextDelta: (delta) => {
          deltas.push(delta);
        },
      },
    );

    expect(deltas).toEqual([]);
    expect(response.success).toBe(true);
    expect(ChatMessage.textContent(response.message!)).toBe("ab");
  });

  it("Anthropic block 流式只传增量 text", async () => {
    const blockChunks = [
      new AIMessageChunk({
        content: [{ type: "text", id: "block-1", text: "hel" }],
      }),
      new AIMessageChunk({
        content: [{ type: "text", id: "block-1", text: "lo" }],
      }),
    ];

    const adapter = new LangGraphAgentAdapter(descriptor, [], createModel(), []);
    const aggregateStream = (
      adapter as unknown as {
        aggregateStream: (
          chunks: AsyncIterable<AIMessageChunk>,
          onTextDelta?: (delta: string) => void,
        ) => Promise<{ content: unknown }>;
      }
    ).aggregateStream.bind(adapter);

    const deltas: string[] = [];
    const result = await aggregateStream(
      (async function* () {
        for (const chunk of blockChunks) {
          yield chunk;
        }
      })(),
      (delta) => deltas.push(delta),
    );

    expect(deltas).toEqual(["hel", "lo"]);
    expect(result.content).toEqual([{ type: "text", id: "block-1", text: "hello" }]);
  });
});
