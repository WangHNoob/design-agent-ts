export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting_hitl"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type ExecutionTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "cancelled";

export type ExecutionAttemptStatus = "running" | "success" | "error" | "cancelled" | "timed_out";

export type ExecutionErrorClass = "transient" | "permanent" | "cancelled" | "timeout";

export type ExecutionPayload = Readonly<Record<string, unknown>>;

/** Terminal outcome of an execution, used for observability clustering and flywheel backfeed. */
export type ExecutionOutcome =
  | "success"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "hitl_rejected"
  | "hitl_modified";

/**
 * Structured per-execution outcome signal (flywheel plan 01-P4).
 *
 * Landing points: `executions.requirement_hash` + `executions.outcome_signal` columns
 * (written by ExecutionService at every terminal transition) and the `execution_outcome`
 * event appended by the ExecutionWorker. Consumers: agent-observe metrics/reporting
 * (cluster by requirementHash) and the flywheel backfeed scheduler.
 */
export interface ExecutionOutcomeSignal {
  readonly executionId: string;
  readonly mode: "design" | "query" | "table";
  readonly outcome: ExecutionOutcome;
  /** Retry count (queue redeliveries) of this execution. */
  readonly attempts: number;
  /** Review points this execution passed through. */
  readonly hitlCheckpoints: readonly string[];
  /** Normalized requirement hash — identical for near-duplicate requirements. */
  readonly requirementHash: string;
  /** ErrorClassifier class when the outcome is a failure. */
  readonly failReason?: string;
}

export interface Execution {
  id: string;
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  status: ExecutionStatus;
  requestPayload: ExecutionPayload;
  planPayload?: ExecutionPayload;
  resultPayload?: ExecutionPayload;
  resumeCursor?: string;
  resumePayload?: ExecutionPayload;
  errorClass?: ExecutionErrorClass;
  errorMessage?: string;
  deadlineAt?: string;
  startedAt?: string;
  completedAt?: string;
  /** 执行模式（冗余自 request_payload.mode；观测台按模式统计）。 */
  mode?: "design" | "query" | "table";
  /** Normalized requirement hash (flywheel 01-P4). */
  requirementHash?: string;
  /** Terminal outcome signal (flywheel 01-P4). */
  outcomeSignal?: ExecutionOutcomeSignal;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionTask {
  id: string;
  userId: string;
  executionId: string;
  taskKey: string;
  name: string;
  agentName?: string;
  status: ExecutionTaskStatus;
  dependencies: readonly string[];
  inputPayload: ExecutionPayload;
  outputPayload?: ExecutionPayload;
  resumeCursor?: string;
  resumePayload?: ExecutionPayload;
  position: number;
  errorClass?: ExecutionErrorClass;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionAttempt {
  id: string;
  userId: string;
  executionId: string;
  taskId: string;
  attemptNumber: number;
  status: ExecutionAttemptStatus;
  errorClass?: ExecutionErrorClass;
  errorCode?: string;
  errorMessage?: string;
  inputPayload: ExecutionPayload;
  outputPayload?: ExecutionPayload;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
}
