#!/usr/bin/env node
/**
 * Flywheel 01-P4: offline eval regression gate.
 *
 * Runs `run-offline-eval.ts` (exact-only, no LLM key) unless `--report` is given,
 * then compares the fresh report against a committed baseline (`eval/baseline.json`).
 * Fails (exit 1) on:
 *   - pass-count regression (any previously-passed score now failing)
 *   - average-score drop beyond `--tolerance` (default 0.02)
 *   - dataset drift: the dataset file hash differs from the baseline's recorded
 *     hash (EV-027-style golden staleness guard) — refresh the baseline with
 *     `--update-baseline` after deliberately changing the golden set.
 *
 * Usage:
 *   pnpm eval:gate                       # run eval + compare
 *   pnpm eval:gate -- --report <path>    # reuse an existing report
 *   pnpm eval:gate -- --update-baseline  # record the current run as the new baseline
 *   pnpm eval:gate -- --baseline <path>  # custom baseline file
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DEFAULT_BASELINE = join(ROOT, "eval", "baseline.json");
const DEFAULT_DATASET = join(ROOT, "eval", "datasets", "design-golden.v1.json");
const DEFAULT_TOLERANCE = 0.02;

export function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

export function datasetSignature(datasetPath) {
  return sha256Hex(readFileSync(datasetPath, "utf8"));
}

/** Reduce a parsed EvalReport JSON to the fields the gate compares. */
export function summarizeReport(report) {
  const summary = report?.summary;
  if (!summary || !Array.isArray(report?.scores)) {
    throw new Error("Report is missing summary/scores (not an EvalReport JSON)");
  }
  return {
    datasetId: report.task?.datasetId ?? "unknown",
    total: summary.total,
    passed: summary.passed,
    passRate: summary.passRate,
    averageScore: summary.averageScore,
    byMetric: summary.byMetric,
    failedScores: report.scores
      .filter((score) => !score.passed)
      .map((score) => `${score.caseId}/${score.metricId}`)
      .sort(),
  };
}

export function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) return null;
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

export function writeBaseline(baselinePath, { datasetId, datasetPath, summary }) {
  const baseline = {
    createdAt: new Date().toISOString(),
    datasetId,
    datasetHash: datasetSignature(datasetPath),
    summary,
  };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
  return baseline;
}

/**
 * Compare a fresh report against the baseline.
 * Returns { ok, regressions, reasons } — never throws on comparison result.
 */
export function compareReportToBaseline(currentSummary, baseline, { tolerance = DEFAULT_TOLERANCE } = {}) {
  const regressions = [];
  const reasons = [];
  if (!baseline) {
    reasons.push("No baseline found — run once with --update-baseline to record one");
    return { ok: false, regressions, reasons };
  }

  if (baseline.datasetId && baseline.datasetId !== currentSummary.datasetId) {
    regressions.push(`dataset switched: ${baseline.datasetId} → ${currentSummary.datasetId}`);
    reasons.push("Dataset id changed; refresh baseline with --update-baseline");
  }

  const oldPassed = new Set(baseline.summary?.failedScores ?? []);
  const newlyFailed = currentSummary.failedScores.filter((score) => !oldPassed.has(score));
  if (newlyFailed.length > 0) {
    regressions.push(...newlyFailed.map((score) => `newly failed: ${score}`));
    reasons.push(`${newlyFailed.length} score(s) regressed vs baseline`);
  }

  const oldAverage = baseline.summary?.averageScore;
  if (
    typeof oldAverage === "number"
    && currentSummary.averageScore < oldAverage - tolerance
  ) {
    regressions.push(
      `averageScore ${oldAverage.toFixed(4)} → ${currentSummary.averageScore.toFixed(4)} ` +
        `(drop ${(oldAverage - currentSummary.averageScore).toFixed(4)} > tolerance ${tolerance})`,
    );
    reasons.push("Average score dropped beyond tolerance");
  }

  return { ok: regressions.length === 0, regressions, reasons };
}

/** Run the offline eval and return the path of the newest report JSON it wrote. */
export function runOfflineEval({ outDir } = {}) {
  const dir = outDir ?? mkdtempSync(join(tmpdir(), "eval-gate-"));
  const tsxCli = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsxCli)) {
    throw new Error(`tsx CLI not found at ${tsxCli} — run pnpm install first`);
  }
  const result = spawnSync(
    process.execPath,
    [tsxCli, join(ROOT, "scripts", "run-offline-eval.ts"), "--exact-only", "--out", dir],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "true" } },
  );
  if (result.status !== 0) {
    throw new Error(
      `Offline eval failed (exit ${result.status ?? "signal"}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  const reports = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort();
  if (reports.length === 0) {
    throw new Error(`Offline eval wrote no report JSON into ${dir}`);
  }
  return reports[reports.length - 1];
}

function parseArgs(argv) {
  const args = { report: null, baseline: DEFAULT_BASELINE, dataset: DEFAULT_DATASET, updateBaseline: false, tolerance: DEFAULT_TOLERANCE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--report" && argv[i + 1]) {
      args.report = resolve(ROOT, argv[++i]);
    } else if (a === "--baseline" && argv[i + 1]) {
      args.baseline = resolve(ROOT, argv[++i]);
    } else if (a === "--dataset" && argv[i + 1]) {
      args.dataset = resolve(ROOT, argv[++i]);
    } else if (a === "--update-baseline") {
      args.updateBaseline = true;
    } else if (a === "--tolerance" && argv[i + 1]) {
      args.tolerance = Number(argv[++i]);
    }
  }
  return args;
}

function formatReport({ current, baseline, datasetSignature }) {
  const lines = [];
  lines.push(`dataset:        ${current.datasetId}  (hash ${datasetSignature})`);
  lines.push(`passed:         ${current.passed}/${current.total}  (${(current.passRate * 100).toFixed(1)}%)`);
  lines.push(`averageScore:   ${current.averageScore.toFixed(4)}`);
  if (baseline) {
    lines.push(`baseline passed: ${baseline.summary.passed}/${baseline.summary.total}  avg ${baseline.summary.averageScore.toFixed(4)} (${baseline.createdAt})`);
  } else {
    lines.push(`baseline:       <none>`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.report ?? runOfflineEval();
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const current = summarizeReport(report);
  const currentHash = datasetSignature(args.dataset);

  let baseline = loadBaseline(args.baseline);
  if (baseline && baseline.datasetHash !== currentHash) {
    if (args.updateBaseline) {
      console.log(`[eval-gate] dataset changed (${baseline.datasetHash} → ${currentHash}); refreshing baseline`);
    } else {
      console.error(
        `[eval-gate] DATASET DRIFT: ${args.dataset}\n` +
          `  baseline hash ${baseline.datasetHash} ≠ current ${currentHash}\n` +
          "  The golden set changed without a baseline refresh (EV-027 class).\n" +
          "  Deliberate change? Run: pnpm eval:gate -- --update-baseline",
      );
      process.exitCode = 1;
      return;
    }
  }

  const comparison = compareReportToBaseline(current, baseline, { tolerance: args.tolerance });

  if (args.updateBaseline) {
    baseline = writeBaseline(args.baseline, {
      datasetId: current.datasetId,
      datasetPath: args.dataset,
      summary: current,
    });
    comparison.ok = true;
    comparison.reasons.length = 0;
    comparison.regressions.length = 0;
  }

  console.log(`[eval-gate] report: ${reportPath}`);
  console.log(formatReport({ current, baseline, datasetSignature: currentHash }));

  if (comparison.ok) {
    console.log(`[eval-gate] PASS (${current.passed}/${current.total} passed, avg ${current.averageScore.toFixed(4)})`);
  } else {
    console.error("[eval-gate] FAIL");
    for (const reason of comparison.reasons) console.error(`  - ${reason}`);
    for (const regression of comparison.regressions) console.error(`  ! ${regression}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`[eval-gate] error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  });
}
