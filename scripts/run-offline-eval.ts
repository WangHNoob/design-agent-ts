/**
 * Offline Eval V1 runner — zero Agent cost, scores recorded Trace reflux / fixtures.
 *
 * Usage:
 *   pnpm eval:offline
 *   pnpm eval:offline -- --dataset eval/datasets/design-golden.v1.json --exact-only
 *
 * --exact-only: skip llm_judge metrics (CI default, no LLM key required).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEvalDataset } from "../src/core/eval/parseEvalDataset.js";
import { ExactMatchScorer } from "../src/core/eval/ExactMatchScorer.js";
import { LlmJudgeScorer } from "../src/core/eval/LlmJudgeScorer.js";
import { EvalRunner } from "../src/core/eval/EvalRunner.js";
import { InMemoryEvalStore } from "../src/core/eval/InMemoryEvalStore.js";
import { formatEvalReportMarkdown } from "../src/core/eval/formatEvalReport.js";
import { MockModelAdapter } from "../src/adapter/mock/MockModelAdapter.js";
import { ChatMessage } from "../src/port/message/ChatMessage.js";
import type { IdGeneratorPort } from "../src/port/infra/IdGeneratorPort.js";
import type { ScorerPort } from "../src/port/eval/ScorerPort.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseArgs(argv: string[]) {
  let dataset = resolve(root, "eval/datasets/design-golden.v1.json");
  let exactOnly = false;
  let outDir = resolve(root, "eval/reports");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dataset" && argv[i + 1]) {
      dataset = resolve(root, argv[++i]!);
    } else if (a === "--exact-only") {
      exactOnly = true;
    } else if (a === "--out" && argv[i + 1]) {
      outDir = resolve(root, argv[++i]!);
    }
  }
  return { dataset, exactOnly, outDir };
}

class SeqIdGenerator implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `eval-${this.n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
  }
}

async function main(): Promise<void> {
  const { dataset: datasetPath, exactOnly, outDir } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(readFileSync(datasetPath, "utf8"));
  let dataset = parseEvalDataset(raw);

  if (exactOnly) {
    const keep = new Set(
      dataset.metrics.filter((m) => m.kind === "exact_match").map((m) => m.id),
    );
    dataset = {
      ...dataset,
      metrics: dataset.metrics.filter((m) => keep.has(m.id)),
      baselines: dataset.baselines.filter((b) => keep.has(b.metricId)),
    };
  }

  const scorers: ScorerPort[] = [new ExactMatchScorer()];
  if (!exactOnly && dataset.metrics.some((m) => m.kind === "llm_judge")) {
    // Deterministic mock judge for local/CI without API keys.
    // Replace with a real ChatModelPort in Online / gated CI jobs.
    const mockJudge = new MockModelAdapter([
      ChatMessage.text(
        "assistant",
        "judge",
        JSON.stringify({
          score: 0.85,
          passed: true,
          rationale: "mock judge: structure and mechanisms look reasonable",
        }),
      ),
    ]);
    scorers.push(new LlmJudgeScorer(mockJudge));
  }

  const runner = new EvalRunner({
    store: new InMemoryEvalStore(),
    scorers,
    ids: new SeqIdGenerator(),
  });

  const report = await runner.run({
    dataset,
    mode: "offline",
    attributes: { datasetPath, exactOnly },
  });

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mdPath = resolve(outDir, `offline-${dataset.id}-${stamp}.md`);
  const jsonPath = resolve(outDir, `offline-${dataset.id}-${stamp}.json`);
  const md = formatEvalReportMarkdown(report);
  writeFileSync(mdPath, md, "utf8");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log(md);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);

  // CI gate: unexpected failures (non-negative cases) fail the process.
  const unexpectedFails = report.scores.filter((s) => {
    if (s.passed) return false;
    const c = dataset.cases.find((x) => x.id === s.caseId);
    return !(c?.tags?.includes("negative"));
  });

  if (unexpectedFails.length > 0) {
    console.error(
      `Eval failed: ${unexpectedFails.length} unexpected failing score(s)`,
      unexpectedFails.map((s) => `${s.caseId}/${s.metricId}`),
    );
    process.exitCode = 1;
    return;
  }

  // Negative case must fail at least one metric when present
  const negatives = dataset.cases.filter((c) => c.tags?.includes("negative"));
  for (const neg of negatives) {
    const negScores = report.scores.filter((s) => s.caseId === neg.id);
    if (negScores.length > 0 && negScores.every((s) => s.passed)) {
      console.error(`Negative case "${neg.id}" unexpectedly passed all metrics`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
