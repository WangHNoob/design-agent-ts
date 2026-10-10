/**
 * 意图分类黄金评测集运行器（不进门户，仅本地/CI 手动执行）。
 *
 * 用法：
 *   npx tsx --env-file=.env eval/intent/run-eval.ts --tag v1-baseline
 *   npx tsx --env-file=.env eval/intent/run-eval.ts --prompt prompts/intent_classify.md --limit 10 --concurrency 4
 *
 * 输出：
 *   - stdout 摘要（总体/分类别准确率、混淆、延迟、token）
 *   - eval/intent/reports/run-<ts>-<tag>.json 完整报告（含逐例结果，供错例分析）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfig } from "../../src/config/loadConfig.js";
import { LangGraphModelAdapter } from "../../src/adapter/langgraph/LangGraphModelAdapter.js";
import { IntentClassifier, type UserIntent } from "../../src/core/agent/director/IntentClassifier.js";
import type { ChatModelPort } from "../../src/port/model/ChatModelPort.js";
import type { ModelResponse } from "../../src/port/model/ModelResponse.js";
import type { ChatMessage } from "../../src/port/message/ChatMessage.js";

interface GoldenCase {
  id: string;
  category: string;
  expect: UserIntent;
  requirement: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  note?: string;
}
interface GoldenSet {
  version: string;
  description: string;
  cases: GoldenCase[];
}

interface CaseResult {
  id: string;
  category: string;
  expect: UserIntent;
  actual: UserIntent;
  correct: boolean;
  latencyMs: number;
  degraded: boolean;
  attempts: number;
}

/** 统计 token 用量的模型代理（仅评测用，生产代码零侵入）。 */
function withUsageCounter(model: ChatModelPort) {
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  const countingModel: ChatModelPort = {
    async generate(messages: ChatMessage[]): Promise<ModelResponse> {
      const res = await model.generate(messages);
      calls += 1;
      inputTokens += res.inputTokenCount ?? 0;
      outputTokens += res.outputTokenCount ?? 0;
      return res;
    },
    async *stream(messages, options, signal) {
      for await (const chunk of model.stream(messages, options, signal)) yield chunk;
    },
    getModelName: () => model.getModelName(),
    getProvider: () => model.getProvider(),
  };
  return {
    countingModel,
    stats: () => ({ calls, inputTokens, outputTokens }),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) args[key] = argv[i + 1] ?? "";
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const setPath = args.set ?? "eval/intent/golden-set.json";
  const promptPath = args.prompt ?? "prompts/intent_classify.md";
  const tag = args.tag ?? "untagged";
  const limit = Number(args.limit ?? 0) || Infinity;
  const concurrency = Math.max(1, Number(args.concurrency ?? 4));

  const golden: GoldenSet = JSON.parse(fs.readFileSync(setPath, "utf-8"));
  const prompt = fs.readFileSync(promptPath, "utf-8");
  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12);

  const config = loadConfig();
  const primary = {
    provider: config.model.provider,
    modelName: config.model.modelName,
    apiKey: config.model.apiKey,
    baseUrl: config.model.baseUrl,
    maxTokens: config.limits.modelMaxTokens,
  };
  const model = new LangGraphModelAdapter(primary, {
    fallbacks: config.model.fallbackModels.map((m) => ({ ...primary, modelName: m })),
    failureThreshold: config.model.fallbackFailureThreshold,
    cooldownMs: config.model.fallbackCooldownMs,
    callTimeoutMs: config.model.callTimeoutMs,
  });
  const { countingModel, stats } = withUsageCounter(model);

  const cases = golden.cases.slice(0, limit);
  console.log(
    `eval: set=${setPath}(${cases.length}/${golden.cases.length}) prompt=${promptPath} hash=${promptHash} ` +
      `model=${config.model.provider}/${config.model.modelName} concurrency=${concurrency}`,
  );

  const classifier = new IntentClassifier(countingModel, { prompt, timeoutMs: 30_000, maxCheckChars: 0 });

  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const idx = next++;
      const c = cases[idx];
      const trace = await classifier.classifyWithTrace(c.requirement, c.history);
      results[idx] = {
        id: c.id,
        category: c.category,
        expect: c.expect,
        actual: trace.intent,
        correct: trace.intent === c.expect,
        latencyMs: trace.latencyMs,
        degraded: trace.degraded,
        attempts: trace.attempts,
      };
      process.stdout.write(results[idx].correct ? "." : `✗${c.id}(${c.expect}→${trace.intent})`);
    }
  }
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));
  const wallMs = Date.now() - startedAt;
  process.stdout.write("\n");

  const correct = results.filter((r) => r.correct).length;
  const byCategory = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const entry = byCategory.get(r.category) ?? { total: 0, correct: 0 };
    entry.total += 1;
    entry.correct += r.correct ? 1 : 0;
    byCategory.set(r.category, entry);
  }
  const missedChatToTask = results.filter((r) => !r.correct && r.expect === "chat");
  const swallowedTaskToChat = results.filter((r) => !r.correct && r.expect === "task");
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const usage = stats();

  const report = {
    tag,
    timestamp: new Date().toISOString(),
    setPath,
    setVersion: golden.version,
    promptPath,
    promptHash,
    model: `${config.model.provider}/${config.model.modelName}`,
    total: results.length,
    correct,
    accuracy: Number((correct / results.length).toFixed(4)),
    // 漏判（chat→task）：安全方向——闲聊走了规划，功能退化但不吞任务
    missChatToTask: missedChatToTask.length,
    // 误吞（task→chat）：危险方向——真实任务被闲聊直答吃掉
    swallowTaskToChat: swallowedTaskToChat.length,
    byCategory: Object.fromEntries(
      [...byCategory.entries()].map(([k, v]) => [k, { ...v, accuracy: Number((v.correct / v.total).toFixed(4)) }]),
    ),
    latencyMs: {
      mean: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.at(-1) ?? 0,
    },
    tokens: {
      llmCalls: usage.calls,
      inputTotal: usage.inputTokens,
      outputTotal: usage.outputTokens,
      inputAvgPerCase: Math.round(usage.inputTokens / results.length),
      outputAvgPerCase: Math.round(usage.outputTokens / results.length),
    },
    wallMs,
    results,
  };

  const outBase = `run-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${tag}`;
  const outPath = path.join("eval/intent/reports", `${outBase}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n== 意图分类评测：${tag} ==`);
  console.log(`总体: ${correct}/${results.length} = ${(report.accuracy * 100).toFixed(1)}%`);
  console.log(`误吞 task→chat（危险）: ${report.swallowTaskToChat}`);
  console.log(`漏判 chat→task（安全）: ${report.missChatToTask}`);
  console.log(`延迟 ms: mean=${report.latencyMs.mean} p50=${report.latencyMs.p50} p95=${report.latencyMs.p95}`);
  console.log(`token/例: in≈${report.tokens.inputAvgPerCase} out≈${report.tokens.outputAvgPerCase}（共 ${usage.calls} 次 LLM 调用）`);
  for (const [cat, v] of Object.entries(report.byCategory)) {
    const mark = v.accuracy < 1 ? " ←" : "";
    console.log(`  ${cat}: ${v.correct}/${v.total}${mark}`);
  }
  if (results.some((r) => !r.correct)) {
    console.log("\n错例（供 prompt 迭代）:");
    for (const r of results.filter((x) => !x.correct)) {
      const c = cases.find((x) => x.id === r.id)!;
      console.log(`  [${r.id}] ${r.expect}→${r.actual}：「${c.requirement.slice(0, 60)}」${c.history ? "（含历史）" : ""}`);
    }
  }
  console.log(`\n报告: ${outPath}`);
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(1);
});
