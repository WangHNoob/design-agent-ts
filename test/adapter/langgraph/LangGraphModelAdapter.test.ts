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

  it("注册表 provider id：默认 baseURL + toggle 型思考参数（zai/GLM）", () => {
    const adapter = new LangGraphModelAdapter({
      provider: "zai",
      modelName: "glm-4.6",
      apiKey: "sk-test",
      reasoning: { mode: "high" },
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { baseURL: "https://api.z.ai/api/paas/v4" },
        modelKwargs: { enable_thinking: true },
      })
    );
    expect(adapter.getModelName()).toBe("glm-4.6");
  });

  it("effort 型模型映射 reasoning.effort（deepseek），off 下发 enable_thinking=false", () => {
    new LangGraphModelAdapter({
      provider: "deepseek",
      modelName: "deepseek-v4-flash",
      apiKey: "sk-test",
      reasoning: { mode: "high" },
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: { effort: "high" } })
    );

    new LangGraphModelAdapter({
      provider: "deepseek",
      modelName: "deepseek-v4-flash",
      apiKey: "sk-test",
      reasoning: { mode: "off" },
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ modelKwargs: { enable_thinking: false } })
    );
  });

  it("anthropic 协议注册表 id（minimax）走 ChatAnthropic；未登记模型按协议回退预算思考", () => {
    new LangGraphModelAdapter({
      provider: "minimax",
      modelName: "minimax-unknown-model",
      apiKey: "sk-test",
      reasoning: { mode: "high" },
    });
    expect(ChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropicApiUrl: "https://api.minimax.io/anthropic/v1",
        thinking: { type: "enabled", budget_tokens: 16384 },
      })
    );
  });

  it("GLM 编码套餐（anthropic 协议 + 仅 effort 型）→ outputConfig.effort", () => {
    new LangGraphModelAdapter({
      provider: "glm-coding-plan",
      modelName: "glm-5.3-flash",
      apiKey: "sk-test",
      reasoning: { mode: "high" },
    });
    expect(ChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        anthropicApiUrl: "https://open.bigmodel.cn/api/anthropic",
        outputConfig: { effort: "high" },
      })
    );
  });

  it("getActiveModelName 反映用户 BYOK 模型（缓存命中时）", () => {
    const userAdapter = new LangGraphModelAdapter({ provider: "zai", modelName: "glm-4.6", apiKey: "k-user" });
    const wrapper = new LangGraphModelAdapter(
      { provider: "openai", modelName: "gpt-4o", apiKey: "k-global" },
      { userOverride: { getUserId: () => "u1", loadModelConfig: async () => null } },
    );
    // 未预热：缓存未命中 → 全局模型名
    expect(wrapper.getActiveModelName()).toBe("gpt-4o");
    // 模拟 preload 后的用户适配器缓存
    (wrapper as unknown as { userAdapters: Map<string, { adapter: LangGraphModelAdapter; key: string }> })
      .userAdapters.set("u1", { adapter: userAdapter, key: "k" });
    expect(wrapper.getActiveModelName()).toBe("glm-4.6");
  });

  it("用户显式 baseUrl 覆盖注册表预设", () => {
    new LangGraphModelAdapter({
      provider: "deepseek",
      modelName: "deepseek-v4-flash",
      apiKey: "sk-test",
      baseUrl: "https://my-proxy.example.com/v1",
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: { baseURL: "https://my-proxy.example.com/v1" },
      })
    );
  });

  it("无 reasoning 配置：toggle 型模型显式关思考，未登记模型不传思考参数", () => {
    new LangGraphModelAdapter({
      provider: "deepseek",
      modelName: "deepseek-v4-flash",
      apiKey: "sk-test",
    });
    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ modelKwargs: { enable_thinking: false } })
    );

    new LangGraphModelAdapter({
      provider: "openai-compatible",
      modelName: "totally-unknown-model",
      apiKey: "sk-test",
    });
    const call = vi.mocked(ChatOpenAI).mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call.reasoning).toBeUndefined();
    expect(call.modelKwargs).toBeUndefined();
  });
});
