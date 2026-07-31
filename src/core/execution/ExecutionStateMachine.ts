import type { ExecutionStatus } from "../../port/execution/types.js";

const TERMINAL_STATUSES = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

const ALLOWED_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  queued: ["running", "cancelled", "timed_out"],
  running: ["queued", "waiting_hitl", "completed", "failed", "cancelled", "timed_out"],
  waiting_hitl: ["queued", "failed", "cancelled", "timed_out"],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export class InvalidExecutionTransitionError extends Error {
  constructor(
    readonly executionId: string,
    readonly currentStatus: ExecutionStatus,
    readonly nextStatus: ExecutionStatus,
  ) {
    super(`Execution ${executionId} cannot transition from ${currentStatus} to ${nextStatus}`);
    this.name = "InvalidExecutionTransitionError";
  }
}

export class ExecutionStateMachine {
  static isTerminal(status: ExecutionStatus): boolean {
    return TERMINAL_STATUSES.has(status);
  }

  static canTransition(current: ExecutionStatus, next: ExecutionStatus): boolean {
    return ALLOWED_TRANSITIONS[current].includes(next);
  }

  static assertTransition(
    executionId: string,
    current: ExecutionStatus,
    next: ExecutionStatus,
  ): void {
    if (!this.canTransition(current, next)) {
      throw new InvalidExecutionTransitionError(executionId, current, next);
    }
  }

  static allowedTransitions(status: ExecutionStatus): readonly ExecutionStatus[] {
    return ALLOWED_TRANSITIONS[status];
  }
}
