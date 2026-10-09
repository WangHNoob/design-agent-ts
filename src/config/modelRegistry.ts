import fs from "node:fs";
import path from "node:path";

/**
 * 模型元数据注册表：加载 models.dev 快照（scripts/fetch-models.mjs 生成，
 * config/models.snapshot.json 提交进仓库），为设置界面提供 provider/模型
 * 清单与能力标注，为模型适配层提供"该模型的思考参数是哪种类型、上下文
 * 上限多少"等事实。快照缺失或模型不在表内时优雅降级（返回 null），调用方
 * 按保守默认处理——注册表是辅助数据源，不是硬依赖。
 */

export type ReasoningOptionType = "toggle" | "effort" | "budget_tokens";

export interface ReasoningOption {
  type: ReasoningOptionType;
  values?: string[];
  min?: number;
}

export interface ModelMeta {
  id: string;
  name: string;
  reasoning: boolean;
  reasoningOptions?: ReasoningOption[];
  toolCall?: boolean;
  context?: number;
  output?: number;
  costIn?: number;
  costOut?: number;
  deprecated?: boolean;
}

export type ProviderProtocol = "openai" | "anthropic" | "openai-compatible";

export interface ProviderMeta {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string | null;
  models: Record<string, ModelMeta>;
}

export interface ModelSnapshot {
  fetchedAt: string;
  source: string;
  providers: Record<string, ProviderMeta>;
}

const SNAPSHOT_PATH = process.env.MODELS_SNAPSHOT_PATH
  ?? path.resolve(process.cwd(), "config", "models.snapshot.json");

let cached: ModelSnapshot | null = null;
let loaded = false;

/** 加载快照；文件缺失/损坏只告警一次并返回 null（注册表是可选增强）。 */
export function loadModelSnapshot(): ModelSnapshot | null {
  if (loaded) return cached;
  loaded = true;
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as ModelSnapshot;
    if (!parsed || typeof parsed.providers !== "object") throw new Error("bad snapshot shape");
    cached = parsed;
  } catch (err) {
    console.warn(`[ModelRegistry] 模型快照不可用（${(err as Error).message}），模型元数据降级为空`);
    cached = null;
  }
  return cached;
}

export function listProviderMetas(): ProviderMeta[] {
  return Object.values(loadModelSnapshot()?.providers ?? {});
}

export function getProviderMeta(providerId: string): ProviderMeta | null {
  return loadModelSnapshot()?.providers[providerId] ?? null;
}

export function getModelMeta(providerId: string, modelId: string): ModelMeta | null {
  return getProviderMeta(providerId)?.models[modelId] ?? null;
}

/** provider 的默认 baseURL（models.dev 的 api 字段）；openai/anthropic 官方端点返回 null。 */
export function providerDefaultBaseUrl(providerId: string): string | null {
  return getProviderMeta(providerId)?.baseUrl ?? null;
}

/**
 * 取模型思考参数的首选类型：优先 effort（档位最通用），其次 budget_tokens，
 * 再次 toggle。无元数据返回 null（调用方按协议保守默认处理）。
 */
export function preferredReasoningOption(meta: ModelMeta | null): ReasoningOption | null {
  if (!meta?.reasoningOptions?.length) return null;
  const byType = (t: ReasoningOptionType) => meta.reasoningOptions!.find((o) => o.type === t) ?? null;
  return byType("effort") ?? byType("budget_tokens") ?? byType("toggle");
}

/** 模型是否支持 effort 档位思考。 */
export function supportsEffort(meta: ModelMeta | null): boolean {
  return !!meta?.reasoningOptions?.some((o) => o.type === "effort");
}

/** 模型是否支持开关型思考（enable_thinking 类）。 */
export function supportsToggle(meta: ModelMeta | null): boolean {
  return !!meta?.reasoningOptions?.some((o) => o.type === "toggle");
}

/** 模型是否支持预算型思考（budget_tokens/thinking_budget 类）。 */
export function supportsBudgetTokens(meta: ModelMeta | null): boolean {
  return !!meta?.reasoningOptions?.some((o) => o.type === "budget_tokens");
}
