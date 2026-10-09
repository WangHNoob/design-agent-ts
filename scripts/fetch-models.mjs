#!/usr/bin/env node
/**
 * 从 models.dev（https://models.dev，sst 开源模型数据库）拉取模型元数据，
 * 裁剪为精简快照写入 config/models.snapshot.json 并提交进仓库。
 *
 * 运行：node scripts/fetch-models.mjs（可带参数 --from <path> 使用本地 api.json）
 *
 * 只保留对本应用有用的字段与 provider：
 * - provider 限定在允许清单内（openai/anthropic 直连 + 有公开 OpenAI 兼容
 *   或 Anthropic 兼容端点的厂商，`api` 字段即默认 baseURL）
 * - 模型字段：id/name/上下文窗口/输出上限/价格/推理支持/思考参数类型/工具调用
 *
 * 协议判定沿用 models.dev 的 npm 字段：@ai-sdk/anthropic → anthropic 协议，
 * @ai-sdk/openai-compatible → openai 兼容，@ai-sdk/openai → openai 官方。
 * google/xai/groq 等原生协议厂商暂不收录（应用侧尚无对应 adapter）。
 */

const ALLOWED_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "deepseek",
  "zai",
  "alibaba",
  "alibaba-cn",
  "moonshotai",
  "moonshotai-cn",
  "siliconflow",
  "siliconflow-cn",
  "openrouter",
  "fireworks-ai",
  "nvidia",
  "minimax",
  "minimax-cn",
]);

/**
 * 本地补充的 provider 预设：models.dev 没有收录、但本应用需要的接入点。
 * 模型元数据从指定源 provider 复制（保持随上游自动更新）。
 */
const LOCAL_PROVIDER_SOURCES = {
  // 智谱 GLM 编码套餐只开放 Anthropic 兼容端点（open.bigmodel.cn），
  // 模型元数据（思考档位 low/high/max 等）与 zai 条目同族
  "glm-coding-plan": {
    name: "智谱 GLM 编码套餐（bigmodel.cn）",
    protocol: "anthropic",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    fromProvider: "zai",
    models: ["glm-5.3-flash", "glm-5.3", "glm-5.2", "glm-4.7", "glm-5-turbo"],
  },
};

function protocolOf(npm, id) {
  if (npm === "@ai-sdk/anthropic") return "anthropic";
  if (npm === "@ai-sdk/openai") return "openai";
  if (npm === "@ai-sdk/openai-compatible") return "openai-compatible";
  // OpenRouter 的官方 SDK 包名特殊，但其 api 是标准 OpenAI 兼容端点
  if (id === "openrouter") return "openai-compatible";
  return null;
}

function trimModel(id, m) {
  if (!m || typeof m !== "object") return null;
  const out = {
    id,
    name: m.name ?? id,
    reasoning: m.reasoning === true,
  };
  if (Array.isArray(m.reasoning_options) && m.reasoning_options.length > 0) {
    out.reasoningOptions = m.reasoning_options.map((o) => {
      const opt = { type: o.type };
      if (Array.isArray(o.values)) opt.values = o.values;
      if (typeof o.min === "number") opt.min = o.min;
      return opt;
    });
  }
  if (m.tool_call === true) out.toolCall = true;
  if (m.limit && typeof m.limit.context === "number") out.context = m.limit.context;
  if (m.limit && typeof m.limit.output === "number") out.output = m.limit.output;
  if (m.cost && typeof m.cost.input === "number") out.costIn = m.cost.input;
  if (m.cost && typeof m.cost.output === "number") out.costOut = m.cost.output;
  if (m.status === "deprecated") out.deprecated = true;
  return out;
}

async function main() {
  const fromIdx = process.argv.indexOf("--from");
  let raw;
  if (fromIdx > -1 && process.argv[fromIdx + 1]) {
    raw = (await import("node:fs")).readFileSync(process.argv[fromIdx + 1], "utf8");
  } else {
    const res = await fetch("https://models.dev/api.json");
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    raw = await res.text();
  }
  const data = JSON.parse(raw);

  const providers = {};
  let modelCount = 0;
  for (const [id, p] of Object.entries(data)) {
    if (!ALLOWED_PROVIDERS.has(id)) continue;
    const protocol = protocolOf(p.npm, id);
    if (!protocol) {
      console.warn(`skip provider ${id}: unknown protocol (npm=${p.npm})`);
      continue;
    }
    const models = {};
    for (const [mid, m] of Object.entries(p.models ?? {})) {
      const trimmed = trimModel(mid, m);
      if (trimmed) {
        models[mid] = trimmed;
        modelCount += 1;
      }
    }
    if (Object.keys(models).length === 0) continue;
    providers[id] = {
      id,
      name: p.name ?? id,
      protocol,
      baseUrl: p.api ?? null,
      models,
    };
  }

  const snapshot = { fetchedAt: new Date().toISOString(), source: "https://models.dev/api.json", providers };
  for (const [id, local] of Object.entries(LOCAL_PROVIDER_SOURCES)) {
    const source = data[local.fromProvider];
    if (!source) {
      console.warn(`skip local provider ${id}: source ${local.fromProvider} missing upstream`);
      continue;
    }
    const models = {};
    for (const mid of local.models) {
      const trimmed = trimModel(mid, source.models?.[mid]);
      if (trimmed) models[mid] = trimmed;
    }
    if (Object.keys(models).length === 0) {
      console.warn(`skip local provider ${id}: no models resolved from ${local.fromProvider}`);
      continue;
    }
    providers[id] = { id, name: local.name, protocol: local.protocol, baseUrl: local.baseUrl, models };
    modelCount += Object.keys(models).length;
  }
  const fs = await import("node:fs");
  const path = await import("node:path");
  const target = path.resolve(process.cwd(), "config/models.snapshot.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 1) + "\n");
  console.log(`wrote ${target}: ${Object.keys(providers).length} providers, ${modelCount} models`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
