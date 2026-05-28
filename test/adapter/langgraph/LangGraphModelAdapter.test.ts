import { describe, it, expect, vi } from "vitest";

// Mock LangChain models before importing adapter
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation((config) => ({
    modelName: config.modelName,
    invoke: vi.fn(),
    stream: vi.fn(),
  })),
}));

vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: vi.fn().mockImplementation((config) => ({
    modelName: config.modelName,
    invoke: vi.fn(),
    stream: vi.fn(),
  })),
}));

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";

describe("LangGraphModelAdapter", () => {
  it("应使用 OpenAI provider 构造", () => {
    const adapter = new LangGraphModelAdapter({
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "sk-test",
    });
    expect(ChatOpenAI).toHaveBeenCalled();
    expect(adapter.getModelName()).toBe("gpt-4o");
    expect(adapter.getProvider()).toBe("openai");
  });

  it("应使用 Anthropic provider 构造", () => {
    const adapter = new LangGraphModelAdapter({
      provider: "anthropic",
      modelName: "claude-3-sonnet",
      apiKey: "sk-test",
    });
    expect(ChatAnthropic).toHaveBeenCalled();
    expect(adapter.getModelName()).toBe("claude-3-sonnet");
    expect(adapter.getProvider()).toBe("anthropic");
  });

  it("openai-compatible 应使用 ChatOpenAI + baseUrl", () => {
    const adapter = new LangGraphModelAdapter({
      provider: "openai-compatible",
      modelName: "qwen-max",
      apiKey: "sk-test",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
      })
    );
    expect(adapter.getModelName()).toBe("qwen-max");
  });
});
