import type { EvalReport } from "../../port/eval/types.js";

/** Format an EvalReport as human-readable markdown (CI / console). */
export function formatEvalReportMarkdown(report: EvalReport): string {
  const { task, summary, scores } = report;
  const lines: string[] = [
    `# Eval Report`,
    ``,
    `- taskId: \`${task.id}\``,
    `- datasetId: \`${task.datasetId}\``,
    `- mode: **${task.mode}**`,
    `- status: ${task.status}`,
    `- passRate: ${(summary.passRate * 100).toFixed(1)}% (${summary.passed}/${summary.total})`,
    `- averageScore: ${summary.averageScore.toFixed(3)}`,
    ``,
    `## By metric`,
    ``,
  ];

  for (const [metricId, bucket] of Object.entries(summary.byMetric)) {
    lines.push(
      `- **${metricId}**: pass ${bucket.passed}/${bucket.total}, avg ${bucket.averageScore.toFixed(3)}`,
    );
  }

  lines.push(``, `## Scores`, ``);
  for (const s of scores) {
    const mark = s.passed ? "PASS" : "FAIL";
    const trace = s.traceId ? ` traceId=\`${s.traceId}\`` : "";
    lines.push(
      `- [${mark}] case=\`${s.caseId}\` metric=\`${s.metricId}\` score=${s.score.toFixed(3)}${trace}`,
    );
    if (s.rationale) {
      lines.push(`  - ${s.rationale.replace(/\n/g, " ")}`);
    }
  }

  lines.push(``);
  return lines.join("\n");
}
