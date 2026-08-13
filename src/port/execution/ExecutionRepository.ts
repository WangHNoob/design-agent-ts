import type {
  Execution,
  ExecutionAttempt,
  ExecutionAttemptStatus,
  ExecutionErrorClass,
  ExecutionOutcomeSignal,
  ExecutionPayload,
  ExecutionStatus,
  ExecutionTask,
  ExecutionTaskStatus,
} from "./types.js";

export interface CreateExecutionInput {
  id: string;
  sessionId: string;
  idempotencyKey: string;
  requestPayload: ExecutionPayload;
  deadlineAt?: string;
}

export interface ExecutionUpdate {
  planPayload?: ExecutionPayload | null;
  resultPayload?: ExecutionPayload | null;
  resumeCursor?: string | null;
  resumePayload?: ExecutionPayload | null;
  errorClass?: ExecutionErrorClass | null;
  errorMessage?: string | null;
  deadlineAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  /** Flywheel 01-P4: normalized requirement hash. */
  requirementHash?: string | null;
  /** Flywheel 01-P4: terminal outcome signal. */
  outcomeSignal?: ExecutionOutcomeSignal | null;
}

export interface ExecutionListOptions {
  status?: ExecutionStatus;
  sessionId?: string;
  limit?: number;
  offset?: number;
}

export interface IdempotentCreateResult<T> {
  entity: T;
  created: boolean;
}

export interface CreateExecutionTaskInput {
  id: string;
  executionId: string;
  taskKey: string;
  name: string;
  agentName?: string;
  dependencies?: readonly string[];
  inputPayload?: ExecutionPayload;
  position?: number;
}

export interface ExecutionTaskTransition {
  outputPayload?: ExecutionPayload | null;
  resumeCursor?: string | null;
  resumePayload?: ExecutionPayload | null;
  errorClass?: ExecutionErrorClass | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CreateExecutionAttemptInput {
  id: string;
  executionId: string;
  taskId: string;
  attemptNumber: number;
  inputPayload?: ExecutionPayload;
  startedAt?: string;
}

export interface CompleteExecutionAttemptInput {
  status: Exclude<ExecutionAttemptStatus, "running">;
  errorClass?: ExecutionErrorClass | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  outputPayload?: ExecutionPayload | null;
  finishedAt?: string;
}

/**
 * Tenant-bound execution persistence contract.
 *
 * Implementations bind a user scope when constructed. Every read and mutation
 * must enforce that scope, including conflict and conditional-transition paths.
 */
export interface ExecutionRepository {
  create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>>;
  get(id: string): Promise<Execution | null>;
  list(options?: ExecutionListOptions): Promise<Execution[]>;
  update(id: string, patch: ExecutionUpdate): Promise<Execution | null>;
  transitionStatus(
    id: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    patch?: ExecutionUpdate,
  ): Promise<Execution | null>;
  delete(id: string): Promise<boolean>;

  createTask(input: CreateExecutionTaskInput): Promise<IdempotentCreateResult<ExecutionTask>>;
  getTask(id: string): Promise<ExecutionTask | null>;
  listTasks(executionId: string): Promise<ExecutionTask[]>;
  transitionTaskStatus(
    id: string,
    expectedStatus: ExecutionTaskStatus,
    nextStatus: ExecutionTaskStatus,
    patch?: ExecutionTaskTransition,
  ): Promise<ExecutionTask | null>;

  createAttempt(input: CreateExecutionAttemptInput): Promise<IdempotentCreateResult<ExecutionAttempt>>;
  listAttempts(taskId: string): Promise<ExecutionAttempt[]>;
  completeAttempt(id: string, input: CompleteExecutionAttemptInput): Promise<ExecutionAttempt | null>;
}
