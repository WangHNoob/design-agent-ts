/**
 * Eval V1 domain types — six entities:
 * Dataset / Case / Metric / Baseline / Task / Score
 */

export type EvalMode = "online" | "offline";

export type MetricKind = "exact_match" | "llm_judge";

export interface EvalMetric {
  readonly id: string;
  readonly name: string;
  readonly kind: MetricKind;
  /** Human-readable scoring criteria (used by LLM judge). */
  readonly criteria?: string;
  /** 0–1 pass threshold (default 1 for exact, 0.7 for judge). */
  readonly passThreshold?: number;
}

/**
 * A single test case. For offline mode, provide recordedOutput and/or
 * sourceTraceId (Trace reflux). Online mode uses input only.
 */
export interface EvalCase {
  readonly id: string;
  readonly input: string;
  /** Optional tags e.g. design / query / structure. */
  readonly tags?: readonly string[];
  /**
   * Recorded Agent output from a prior run / Trace reflux.
   * Required for offline scoring when TraceStore is unavailable.
   */
  readonly recordedOutput?: string;
  /** Optional link back to the producing Trace. */
  readonly sourceTraceId?: string;
  readonly sourceUserId?: string;
}

/**
 * Baseline expectation for one (case × metric) pair.
 * Exact match: expectedOutput / expectedContains.
 * LLM judge: expectedOutput as reference answer (optional).
 */
export interface EvalBaseline {
  readonly caseId: string;
  readonly metricId: string;
  readonly expectedOutput?: string;
  /** All substrings must appear in the actual output (exact-style). */
  readonly expectedContains?: readonly string[];
  /** Extra judge hints / rubrics for this case. */
  readonly judgeRubric?: string;
}

export interface EvalDataset {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly metrics: readonly EvalMetric[];
  readonly cases: readonly EvalCase[];
  readonly baselines: readonly EvalBaseline[];
}

export type EvalTaskStatus = "pending" | "running" | "completed" | "failed";

export interface EvalTask {
  readonly id: string;
  readonly datasetId: string;
  readonly mode: EvalMode;
  readonly status: EvalTaskStatus;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface EvalScore {
  readonly id: string;
  readonly taskId: string;
  readonly caseId: string;
  readonly metricId: string;
  /** Normalized 0–1 score. */
  readonly score: number;
  readonly passed: boolean;
  readonly rationale?: string;
  /** Online: Trace produced by this eval run. Offline: source Trace. */
  readonly traceId?: string;
  readonly actualOutput?: string;
  readonly createdAt: string;
}

export interface EvalReport {
  readonly task: EvalTask;
  readonly scores: readonly EvalScore[];
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly passRate: number;
    readonly averageScore: number;
    readonly byMetric: Readonly<
      Record<string, { total: number; passed: number; averageScore: number }>
    >;
  };
}
