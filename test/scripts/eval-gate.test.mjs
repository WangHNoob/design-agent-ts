import { describe, expect, test } from "vitest";
import {
  compareReportToBaseline,
  summarizeReport,
} from "../../scripts/eval-gate.mjs";

function summary(overrides = {}) {
  return {
    datasetId: "design-golden-v1",
    total: 3,
    passed: 2,
    passRate: 2 / 3,
    averageScore: 0.6667,
    byMetric: { doc_structure: { total: 3, passed: 2, averageScore: 0.6667 } },
    failedScores: ["incomplete-doc/doc_structure"],
    ...overrides,
  };
}

function baseline(overrides = {}) {
  return {
    createdAt: "2026-08-13T00:00:00.000Z",
    datasetId: "design-golden-v1",
    datasetHash: "174078de21c12d1a",
    summary: summary(),
    ...overrides,
  };
}

describe("eval-gate comparison (flywheel 01-P4)", () => {
  test("passes when the fresh report matches the baseline", () => {
    const result = compareReportToBaseline(summary(), baseline());
    expect(result.ok).toBe(true);
    expect(result.regressions).toEqual([]);
  });

  test("fails with the newly-failed scores listed when a score regresses", () => {
    const current = summary({ failedScores: ["incomplete-doc/doc_structure", "combat-basic/doc_structure"] });
    const result = compareReportToBaseline(current, baseline());
    expect(result.ok).toBe(false);
    expect(result.regressions).toContain("newly failed: combat-basic/doc_structure");
    expect(result.reasons.join(" ")).toContain("1 score(s) regressed");
  });

  test("ignores scores that were already failing in the baseline", () => {
    const current = summary({ failedScores: ["incomplete-doc/doc_structure"] });
    expect(compareReportToBaseline(current, baseline()).ok).toBe(true);
  });

  test("fails when average score drops beyond tolerance, passes within tolerance", () => {
    const drop = compareReportToBaseline(
      summary({ averageScore: 0.6 }),
      baseline(),
      { tolerance: 0.02 },
    );
    expect(drop.ok).toBe(false);
    expect(drop.reasons.join(" ")).toContain("Average score dropped");

    const within = compareReportToBaseline(
      summary({ averageScore: 0.655 }),
      baseline(),
      { tolerance: 0.02 },
    );
    expect(within.ok).toBe(true);
  });

  test("fails when the dataset id switches without a refresh", () => {
    const result = compareReportToBaseline(
      summary({ datasetId: "design-golden-v2" }),
      baseline(),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("refresh baseline");
  });

  test("fails with guidance when no baseline exists", () => {
    const result = compareReportToBaseline(summary(), null);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("--update-baseline");
  });

  test("summarizeReport validates the report shape", () => {
    expect(() => summarizeReport({})).toThrow(/summary/);
    expect(() => summarizeReport({ summary: {}, scores: [] })).toThrow(/summary/);
    const parsed = summarizeReport({
      task: { datasetId: "design-golden-v1" },
      summary: { total: 3, passed: 2, passRate: 2 / 3, averageScore: 0.66, byMetric: {}, failed: 1 },
      scores: [
        { caseId: "a", metricId: "m", passed: true },
        { caseId: "b", metricId: "m", passed: false },
      ],
    });
    expect(parsed.failedScores).toEqual(["b/m"]);
  });
});
