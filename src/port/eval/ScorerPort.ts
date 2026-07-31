import type { EvalBaseline, EvalCase, EvalMetric } from "./types.js";

export interface ScoreInput {
  readonly case: EvalCase;
  readonly metric: EvalMetric;
  readonly baseline?: EvalBaseline;
  readonly actualOutput: string;
  readonly traceId?: string;
}

export interface ScoreResult {
  readonly score: number;
  readonly passed: boolean;
  readonly rationale: string;
}

/**
 * Pluggable scorer — ExactMatch / LLM-as-Judge / (future) E2E Judge Agent.
 */
export interface ScorerPort {
  readonly kind: EvalMetric["kind"];
  score(input: ScoreInput): Promise<ScoreResult>;
}
