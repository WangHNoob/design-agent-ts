import { describe, expect, test } from "vitest";
import {
  resolveProviderProtocol,
  resolveProviderBaseUrl,
  resolveReasoningIntent,
  toChatOpenAIParams,
  toChatAnthropicParams,
  EFFORT_DEFAULT_BUDGET,
} from "../../src/config/modelReasoning.js";

/**
 * 依赖仓库内的 models.dev 快照（config/models.snapshot.json）。
 * 快照不可用时 loadModelSnapshot 降级为 null，这里显式断言关键 provider 存在。
 */
describe("resolveProviderProtocol / resolveProviderBaseUrl", () => {
  test("内置协议原样返回", () => {
    expect(resolveProviderProtocol("openai")).toBe("openai");
    expect(resolveProviderProtocol("anthropic")).toBe("anthropic");
    expect(resolveProviderProtocol("openai-compatible")).toBe("openai-compatible");
  });

  test("注册表 provider id 解析为协议与默认 baseURL", () => {
    expect(resolveProviderProtocol("deepseek")).toBe("openai-compatible");
    expect(resolveProviderProtocol("minimax")).toBe("anthropic");
    expect(resolveProviderBaseUrl("deepseek")).toMatch(/^https:\/\/api\.deepseek\.com/);
    expect(resolveProviderBaseUrl("zai")).toContain("api.z.ai");
    expect(resolveProviderBaseUrl("openai")).toBeNull();
  });

  test("未知 provider 保守按 openai 兼容处理", () => {
    expect(resolveProviderProtocol("some-custom-vendor")).toBe("openai-compatible");
    expect(resolveProviderBaseUrl("some-custom-vendor")).toBeNull();
  });
});

describe("resolveReasoningIntent（按注册表 reasoning_options 分发）", () => {
  test("toggle 型模型（GLM）：开启/关闭都走开关", () => {
    expect(resolveReasoningIntent("zai", "glm-4.6", { mode: "medium" })).toEqual({ enableThinking: true });
    expect(resolveReasoningIntent("zai", "glm-4.6", { mode: "off" })).toEqual({ enableThinking: false });
  });

  test("effort+toggle 型模型（DeepSeek）：优先 effort 档位", () => {
    expect(resolveReasoningIntent("deepseek", "deepseek-v4-flash", { mode: "high" })).toEqual({ effort: "high" });
    expect(resolveReasoningIntent("deepseek", "deepseek-v4-flash", { mode: "off" })).toEqual({ enableThinking: false });
  });

  test("anthropic 协议优先映射为预算思考（ChatAnthropic 不支持 effort）", () => {
    const intent = resolveReasoningIntent("anthropic", "claude-haiku-4-5", { mode: "high" });
    expect(intent?.thinkingBudget).toBe(EFFORT_DEFAULT_BUDGET.high);
    expect(intent?.effort).toBeUndefined();
  });

  test("预算可显式指定并受 max_tokens 封顶（Anthropic 要求 < max_tokens）", () => {
    const big = resolveReasoningIntent("anthropic", "claude-haiku-4-5", { mode: "low", budgetTokens: 100_000 }, 8192);
    expect(big?.thinkingBudget).toBe(8192 - 1024);
    const small = resolveReasoningIntent("anthropic", "claude-haiku-4-5", { mode: "low", budgetTokens: 2048 });
    expect(small?.thinkingBudget).toBe(2048);
  });

  test("无元数据时按协议保守：anthropic→预算、openai→档位、兼容端点→不传", () => {
    expect(resolveReasoningIntent("anthropic", "unknown-model", { mode: "low" })?.thinkingBudget).toBe(EFFORT_DEFAULT_BUDGET.low);
    expect(resolveReasoningIntent("openai", "unknown-model", { mode: "medium" })).toEqual({ effort: "medium" });
    expect(resolveReasoningIntent("openai-compatible", "unknown-model", { mode: "high" })).toBeNull();
  });

  test("注册表明确不支持思考的模型返回 null（不透传会被拒的参数）", () => {
    // 在快照里找一个 reasoning=false 的模型（如 minimax 的非推理模型），找不到就跳过
    const s = require("../../config/models.snapshot.json");
    const provider = Object.values(s.providers).find((p: { models: Record<string, { reasoning: boolean }> }) =>
      Object.values(p.models).some((m) => !m.reasoning));
    if (!provider) return;
    const model = Object.entries((provider as { models: Record<string, { reasoning: boolean }> }).models)
      .find(([, m]) => !m.reasoning)![0];
    expect(resolveReasoningIntent((provider as { id: string }).id, model, { mode: "high" })).toBeNull();
  });
});

describe("参数翻译", () => {
  test("effort → ChatOpenAI reasoning；预算/开关 → modelKwargs", () => {
    expect(toChatOpenAIParams({ effort: "low" })).toEqual({ reasoning: { effort: "low" } });
    expect(toChatOpenAIParams({ thinkingBudget: 4096 })).toEqual({
      modelKwargs: { thinking_budget: 4096, enable_thinking: true },
    });
    expect(toChatOpenAIParams({ enableThinking: false })).toEqual({
      modelKwargs: { enable_thinking: false },
    });
    expect(toChatOpenAIParams(null)).toEqual({});
  });

  test("预算 → ChatAnthropic thinking", () => {
    expect(toChatAnthropicParams({ thinkingBudget: 8192 })).toEqual({
      thinking: { type: "enabled", budget_tokens: 8192 },
    });
    expect(toChatAnthropicParams({ effort: "high" })).toEqual({});
    expect(toChatAnthropicParams(null)).toEqual({});
  });
});
