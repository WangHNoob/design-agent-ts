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
