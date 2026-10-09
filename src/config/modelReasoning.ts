import {
  getModelMeta,
  supportsEffort,
  supportsToggle,
  supportsBudgetTokens,
  type ProviderProtocol,
  getProviderMeta,
} from "./modelRegistry.js";
import type { ReasoningConfig } from "../port/model/ModelConfig.js";

/**
 * 思考参数解析：把统一的 ReasoningConfig（五档 + 可选预算）解析为与厂商
 * 无关的"意图"，再由各协议的模型构造器翻译为具体参数。
 *
 * 映射依据 models.dev 注册表里该模型的 reasoning_options 类型：
 * - effort 型（OpenAI o 系、Gemini、最新 Claude）→ reasoning.effort
 * - budget_tokens 型（Claude 扩展思考、Qwen thinking_budget）→ 精确预算
 * - toggle 型（DeepSeek/GLM 等 enable_thinking）→ 开关
 * 无元数据时按协议保守处理：anthropic 一律支持预算思考，openai 按档位直传，
 * openai-compatible 不传（避免不认识的参数被网关拒绝）。
 */

export interface ResolvedReasoning {
  /** OpenAI 风格档位（reasoning_effort / reasoning.effort） */
  effort?: "minimal" | "low" | "medium" | "high";
  /** 精确思考预算（Anthropic thinking.budget_tokens / 兼容端点 thinking_budget） */
  thinkingBudget?: number;
  /** 开关型思考（enable_thinking 类）；false = 显式关闭默认开启的思考 */
  enableThinking?: boolean;
}

/** 档位 → 默认思考预算（tokens）。Anthropic 要求 ≥1024 且 < max_tokens。 */
export const EFFORT_DEFAULT_BUDGET: Record<string, number> = {
  minimal: 1024,
  low: 4096,
  medium: 8192,
  high: 16384,
};

/** 把内置协议或注册表 provider id 解析为底层协议；未知 id 按 openai 兼容处理。 */
export function resolveProviderProtocol(provider: string): ProviderProtocol {
  if (provider === "openai" || provider === "anthropic" || provider === "openai-compatible") {
    return provider;
  }
  return getProviderMeta(provider)?.protocol ?? "openai-compatible";
}

/** provider 的默认 baseURL（注册表 api 字段）；官方端点返回 null。 */
export function resolveProviderBaseUrl(provider: string): string | null {
  return getProviderMeta(provider)?.baseUrl ?? null;
}

function clampBudget(cfg: ReasoningConfig, maxTokens?: number): number {
  const requested = cfg.budgetTokens ?? EFFORT_DEFAULT_BUDGET[cfg.mode] ?? 8192;
  // 预算必须 < max_tokens（Anthropic 硬约束），留 1024 给可见输出
  const cap = Math.max(2048, (maxTokens ?? 65536) - 1024);
  return Math.max(1024, Math.min(requested, cap));
}

/**
 * 解析思考意图。mode==='off' 时仅当模型属于"默认开启思考"的 toggle 型
 * （如 Qwen3/GLM）才显式下发关闭，其余情况不传参数（用厂商默认）。
 */
export function resolveReasoningIntent(
  provider: string,
  modelName: string,
  cfg?: ReasoningConfig,
  maxTokens?: number,
): ResolvedReasoning | null {
  if (!cfg || cfg.mode === "off") {
    const meta = getModelMeta(provider, modelName);
    return meta && supportsToggle(meta) ? { enableThinking: false } : null;
  }

  const meta = getModelMeta(provider, modelName);
  if (meta) {
    // anthropic 协议只支持预算型思考（thinking.budget_tokens）：
    // 即使注册表同时标注 effort（新式 adaptive 参数），也优先映射预算
    const preferBudget = resolveProviderProtocol(provider) === "anthropic";
    if (preferBudget && supportsBudgetTokens(meta)) {
      return { thinkingBudget: clampBudget(cfg, maxTokens) };
    }
    if (supportsEffort(meta)) {
      return { effort: cfg.mode === "minimal" ? "minimal" : cfg.mode };
    }
    if (supportsBudgetTokens(meta)) {
      return { thinkingBudget: clampBudget(cfg, maxTokens) };
    }
    if (supportsToggle(meta)) {
      return { enableThinking: true };
    }
    return null; // 注册表明确该模型不支持思考
  }

  // 无元数据：按解析后的协议保守映射
  const protocol = resolveProviderProtocol(provider);
  if (protocol === "anthropic") {
    return { thinkingBudget: clampBudget(cfg, maxTokens) };
  }
  if (protocol === "openai") {
    return { effort: cfg.mode };
  }
  return null;
}

/** 翻译为 ChatOpenAI 构造参数（openai / openai-compatible 两协议共用）。 */
export function toChatOpenAIParams(
  intent: ResolvedReasoning | null,
): { reasoning?: { effort: "minimal" | "low" | "medium" | "high" }; modelKwargs?: Record<string, unknown> } {
  if (!intent) return {};
  if (intent.effort) {
    return { reasoning: { effort: intent.effort } };
  }
  const modelKwargs: Record<string, unknown> = {};
  if (intent.thinkingBudget !== undefined) {
    modelKwargs.thinking_budget = intent.thinkingBudget;
    modelKwargs.enable_thinking = true;
  } else if (intent.enableThinking !== undefined) {
    modelKwargs.enable_thinking = intent.enableThinking;
  }
  return Object.keys(modelKwargs).length > 0 ? { modelKwargs } : {};
}

/** 翻译为 ChatAnthropic 构造参数（扩展思考预算）。 */
export function toChatAnthropicParams(
  intent: ResolvedReasoning | null,
): { thinking?: { type: "enabled"; budget_tokens: number } } {
  if (!intent?.thinkingBudget) return {};
  return { thinking: { type: "enabled", budget_tokens: intent.thinkingBudget } };
}
