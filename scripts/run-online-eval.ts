/**
 * Online Eval runner — REAL model end-to-end (no fixtures, no mock judge).
 *
 * Runs the actual DirectorAgent (multi-agent design flow / query / table) and
 * scores the real output with a REAL LLM-as-Judge built from the same model
 * config. This is the "eval says something about the product" path.
 *
 * Usage:
 *   pnpm eval:online                        # all cases
 *   pnpm eval:online -- --cases combat-basic,skill-tree
 *   pnpm eval:online -- --dataset eval/datasets/design-golden.v1.json
 *
 * Requires .env with LLM_* credentials (tsx --env-file=.env is in the script).
 * Cost note: ~10-15 LLM calls per design case (plan + subagents + integrate +
 * judge). HITL checkpoints are auto-approved (eval-only, never production).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/loadConfig.js";
import { SettingsManager } from "../src/core/settings/SettingsManager.js";
import { NodeFileSystemAdapter } from "../src/adapter/fs/NodeFileSystemAdapter.js";
import { LangGraphModelAdapter } from "../src/adapter/langgraph/LangGraphModelAdapter.js";
import { LangGraphAgentFactory } from "../src/adapter/langgraph/LangGraphAgentFactory.js";
import { DirectorAgent } from "../src/core/agent/director/DirectorAgent.js";
import { ToolManager } from "../src/core/tool/ToolManager.js";
import { SkillManager } from "../src/core/skill/SkillManager.js";
import { MockHumanReviewGateway } from "../src/adapter/mock/MockHumanReviewGateway.js";
import { ConsoleLogger } from "../src/core/observability/ConsoleLogger.js";
import { NoOpTracer } from "../src/core/tracing/DefaultTracer.js";
import { NodeIdGeneratorAdapter } from "../src/adapter/infra/NodeIdGeneratorAdapter.js";
import { parseEvalDataset } from "../src/core/eval/parseEvalDataset.js";
import { ExactMatchScorer } from "../src/core/eval/ExactMatchScorer.js";
import { LlmJudgeScorer } from "../src/core/eval/LlmJudgeScorer.js";
import { EvalRunner } from "../src/core/eval/EvalRunner.js";
import { InMemoryEvalStore } from "../src/core/eval/InMemoryEvalStore.js";
import { formatEvalReportMarkdown } from "../src/core/eval/formatEvalReport.js";
import type { AgentPort, AgentResponse } from "../src/port/agent/AgentPort.js";
import type { IdGeneratorPort } from "../src/port/infra/IdGeneratorPort.js";
import type { ScorerPort } from "../src/port/eval/ScorerPort.js";
import type { ModelConfig } from "../src/port/model/ModelConfig.js";
import { ChatMessage } from "../src/port/message/ChatMessage.js";
import type { EvalCase, EvalDataset } from "../src/port/eval/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  let dataset = resolve(root, "eval/datasets/design-golden.v1.json");
  let cases: string[] | null = null;
  let outDir = resolve(root, "eval/reports");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dataset" && argv[i + 1]) {
      dataset = resolve(root, argv[++i]!);
    } else if (a === "--cases" && argv[i + 1]) {
      cases = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--out" && argv[i + 1]) {
      outDir = resolve(root, argv[++i]!);
    }
  }
  return { dataset, cases, outDir };
}

class SeqIdGenerator implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `eval-${this.n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  }
}

function modeForCase(c: EvalCase): "design" | "query" | "table" {
  if (c.tags?.includes("query")) return "query";
  if (c.tags?.includes("table")) return "table";
  return "design";
}

/**
 * Adapts AgentPort.process (sessionId + messages) to the DirectorAgent's
 * execute(requirement, sessionId, mode, role) — the real multi-agent flow.
 * Case mode is resolved from the case id embedded in the eval session id.
 */
class EvalDirectorAdapter implements AgentPort {
  constructor(
    private readonly director: DirectorAgent,
    private readonly dataset: EvalDataset,
  ) {}

  getName(): string {
    return "DirectorEval";
  }

  async process(sessionId: string, messages: ChatMessage[]): Promise<AgentResponse> {
    // ChatMessage.content is a ContentBlock[] — join the text blocks, never
    // Array.join() the objects themselves (that yields "[object Object]").
    const requirement = messages
      .filter((m) => m.role === "user")
      .map((m) =>
        m.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n"),
      )
      .join("\n");
    // Session ids look like `eval-<caseId>-<rand>`; case ids may contain
    // hyphens, so match by prefix rather than splitting.
    const evalCase = this.dataset.cases.find((c) => sessionId.startsWith(`eval-${c.id}-`));
    const mode = evalCase ? modeForCase(evalCase) : "design";
    return this.director.execute(requirement, sessionId, mode, "chief_designer");
  }
}

async function main(): Promise<void> {
  const { dataset: datasetPath, cases, outDir } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (!config.model.apiKey) {
    console.error("[eval:online] LLM_API_KEY is not set — run via `pnpm eval:online` (loads .env)");
    process.exit(1);
  }

  // Same resolution order as the app: settings.json overrides env (bootstrap
  // mergedModelConfig). Without this the eval would use a stale .env endpoint.
  const settingsManager = new SettingsManager(new NodeFileSystemAdapter(), process.env.SETTINGS_DIR || ".");
  await settingsManager.initialize();
  const settings = settingsManager.getSettings();

  const model = new LangGraphModelAdapter({
    provider: (settings.modelProvider as ModelConfig["provider"]) || config.model.provider,
    modelName: settings.modelName || config.model.modelName,
    apiKey: settings.modelApiKey || config.model.apiKey,
    baseUrl: settings.modelBaseUrl || config.model.baseUrl,
    maxTokens: settings.maxTokens || config.limits.modelMaxTokens,
    temperature: 0,
  });

  // Real DirectorAgent: real model, real subagent factory, real prompts
  // (defaults), empty tool/skill registries, HITL auto-approved for eval.
  const director = new DirectorAgent({
    model,
    agentFactory: new LangGraphAgentFactory(model),
    toolRegistry: new ToolManager(),
    skillRegistry: new SkillManager(),
    humanReviewGateway: new MockHumanReviewGateway(true), // eval-only: never production
    hooks: [],
    limits: {
      queryMaxTokens: 8192,
      subAgentMaxIterations: 10,
    },
    idGenerator: new NodeIdGeneratorAdapter(),
    logger: new ConsoleLogger(),
    tracer: new NoOpTracer(),
  });

  const raw = JSON.parse(readFileSync(datasetPath, "utf8"));
  const dataset = parseEvalDataset(raw);

  const scorers: ScorerPort[] = [new ExactMatchScorer(), new LlmJudgeScorer(model)];

  const runner = new EvalRunner({
    store: new InMemoryEvalStore(),
    scorers,
    ids: new SeqIdGenerator(),
    agent: new EvalDirectorAdapter(director, dataset),
  });

  console.log(`[eval:online] model=${config.model.modelName} cases=${cases?.length ?? dataset.cases.length}`);
  const report = await runner.run({
    dataset,
    mode: "online",
    caseIds: cases ?? undefined,
    attributes: { datasetPath, mode: "online", model: config.model.modelName },
  });

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = resolve(outDir, `online-${dataset.id}-${stamp}.md`);
  const jsonPath = resolve(outDir, `online-${dataset.id}-${stamp}.json`);
  const md = formatEvalReportMarkdown(report);
  writeFileSync(mdPath, md, "utf8");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log(md);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
