import type { ScorerPort, ScoreInput, ScoreResult } from "../../port/eval/ScorerPort.js";

/**
 * Zero-LLM exact / contains matcher.
 * - If expectedOutput is set: normalized equality (trim + collapse whitespace).
 * - If expectedContains is set: all substrings must appear.
 * - If both set: both checks apply (AND).
 */
export class ExactMatchScorer implements ScorerPort {
  readonly kind = "exact_match" as const;

  async score(input: ScoreInput): Promise<ScoreResult> {
    const baseline = input.baseline;
    if (!baseline) {
      return {
        score: 0,
        passed: false,
        rationale: "No baseline for exact_match metric",
      };
    }

    const actual = normalize(input.actualOutput);
    const checks: string[] = [];
    let ok = true;

    if (baseline.expectedOutput !== undefined) {
      const expected = normalize(baseline.expectedOutput);
      const equal = actual === expected;
      checks.push(equal ? "exact output matched" : "exact output mismatch");
      ok = ok && equal;
    }

    if (baseline.expectedContains && baseline.expectedContains.length > 0) {
      const missing: string[] = [];
      for (const needle of baseline.expectedContains) {
        if (!input.actualOutput.includes(needle)) {
          missing.push(needle);
        }
      }
      if (missing.length > 0) {
        ok = false;
        checks.push(`missing required fragments: ${missing.map((m) => JSON.stringify(m)).join(", ")}`);
      } else {
        checks.push(`all ${baseline.expectedContains.length} required fragments present`);
      }
    }

    if (baseline.expectedOutput === undefined && (!baseline.expectedContains || baseline.expectedContains.length === 0)) {
      return {
        score: 0,
        passed: false,
        rationale: "Baseline has neither expectedOutput nor expectedContains",
      };
    }

    const threshold = input.metric.passThreshold ?? 1;
    const score = ok ? 1 : 0;
    return {
      score,
      passed: score >= threshold,
      rationale: checks.join("; "),
    };
  }
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
