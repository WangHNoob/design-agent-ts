import type {
  CreateExecutionInput,
  ExecutionRepository,
  ExecutionUpdate,
  IdempotentCreateResult,
} from "../../port/execution/ExecutionRepository.js";
import type {
  Execution,
  ExecutionErrorClass,
  ExecutionOutcome,
  ExecutionPayload,
  ExecutionStatus,
} from "../../port/execution/types.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import { ErrorClassifier } from "./ErrorClassifier.js";
import {
  ExecutionStateMachine,
  InvalidExecutionTransitionError,
} from "./ExecutionStateMachine.js";
import { buildOutcomeSignal } from "./outcomeSignal.js";

export interface CreateExecutionCommand {
  sessionId: string;
  idempotencyKey: string;
  requestPayload: ExecutionPayload;
  deadlineAt?: string;
}

export interface PauseExecutionCommand {
  resumeCursor?: string;
  resumePayload?: ExecutionPayload;
}

export interface CompleteExecutionCommand {
  resultPayload?: ExecutionPayload;
}

export class ExecutionNotFoundError extends Error {
  constructor(readonly executionId: string) {
    super(`Execution ${executionId} was not found`);
    this.name = "ExecutionNotFoundError";
  }
}

export class ExecutionTransitionConflictError extends Error {
  constructor(
    readonly executionId: string,
    readonly expectedStatus: ExecutionStatus,
  ) {
    super(`Execution ${executionId} remained ${expectedStatus} after a failed conditional transition`);
    this.name = "ExecutionTransitionConflictError";
  }
}

export class ExecutionService {
  constructor(
    private readonly repository: ExecutionRepository,
    private readonly idGenerator: IdGeneratorPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(command: CreateExecutionCommand): Promise<IdempotentCreateResult<Execution>> {
    const input: CreateExecutionInput = {
      id: this.idGenerator.randomUUID(),
      sessionId: command.sessionId,
      idempotencyKey: command.idempotencyKey,
      requestPayload: command.requestPayload,
      deadlineAt: command.deadlineAt,
    };
    return this.repository.create(input);
  }

  claim(executionId: string): Promise<Execution> {
    return this.transition(
      executionId,
      "queued",
      "running",
      { startedAt: this.timestamp(), errorClass: null, errorMessage: null },
    );
  }

  pause(executionId: string, command: PauseExecutionCommand = {}): Promise<Execution> {
    return this.transition(
      executionId,
      "running",
      "waiting_hitl",
      {
        resumeCursor: command.resumeCursor,
        resumePayload: command.resumePayload,
      },
    );
  }

  resume(executionId: string, resumePayload?: ExecutionPayload): Promise<Execution> {
    return this.transition(
      executionId,
      "waiting_hitl",
      "queued",
      {
        resumePayload,
        errorClass: null,
        errorMessage: null,
      },
    );
  }

  requeue(executionId: string, error?: unknown): Promise<Execution> {
    return this.transition(
      executionId,
      "running",
      "queued",
      {
        errorClass: error === undefined ? null : ErrorClassifier.classify(error),
        errorMessage: error === undefined ? null : ErrorClassifier.message(error),
      },
    );
  }

  async complete(executionId: string, command: CompleteExecutionCommand = {}): Promise<Execution> {
    const execution = await this.transition(
      executionId,
      "running",
      "completed",
      {
        resultPayload: command.resultPayload,
        errorClass: null,
        errorMessage: null,
        completedAt: this.timestamp(),
      },
      true,
    );
    await this.recordOutcomeSignal(execution, "success");
    return execution;
  }

  async fail(executionId: string, error: unknown): Promise<Execution> {
    const errorClass = ErrorClassifier.classify(error);
    if (errorClass === "cancelled") {
      return this.cancel(executionId, ErrorClassifier.message(error));
    }
    if (errorClass === "timeout") {
      return this.timeout(executionId, ErrorClassifier.message(error));
    }
    const current = await this.requireExecution(executionId);
    if (current.status === "waiting_hitl") {
      const failed = await this.transition(
        executionId,
        "waiting_hitl",
        "failed",
        {
          errorClass,
          errorMessage: ErrorClassifier.message(error),
          completedAt: this.timestamp(),
        },
        true,
      );
      await this.recordOutcomeSignal(failed, "failed", errorClass);
      return failed;
    }
    const failed = await this.transitionToTerminal(
      executionId,
      "failed",
      errorClass,
      ErrorClassifier.message(error),
    );
    await this.recordOutcomeSignal(failed, "failed", errorClass);
    return failed;
  }

  cancel(executionId: string, message = "Execution cancelled"): Promise<Execution> {
    return this.transitionActiveToTerminal(executionId, "cancelled", "cancelled", message)
      .then(async (execution) => {
        await this.recordOutcomeSignal(execution, "cancelled", "cancelled");
        return execution;
      });
  }

  timeout(executionId: string, message = "Execution timed out"): Promise<Execution> {
    return this.transitionActiveToTerminal(executionId, "timed_out", "timeout", message)
      .then(async (execution) => {
        await this.recordOutcomeSignal(execution, "timed_out", "timeout");
        return execution;
      });
  }

  /**
   * Flywheel 01-P4: persist the structured outcome signal on the executions row at
   * every terminal transition (complete/fail/cancel/timeout). The worker additionally
   * emits an `execution_outcome` event for stream consumers.
   */
  async recordOutcomeSignal(
    execution: Execution,
    outcome: ExecutionOutcome,
    failReason?: string,
  ): Promise<void> {
    await this.repository.update(execution.id, {
      requirementHash: buildOutcomeSignal(execution, outcome).requirementHash,
      outcomeSignal: buildOutcomeSignal(execution, outcome, { failReason }),
    });
  }

  private transitionToTerminal(
    executionId: string,
    nextStatus: "failed",
    errorClass: Exclude<ExecutionErrorClass, "cancelled" | "timeout">,
    errorMessage: string,
  ): Promise<Execution> {
    return this.transition(
      executionId,
      "running",
      nextStatus,
      {
        errorClass,
        errorMessage,
        completedAt: this.timestamp(),
      },
      true,
    );
  }

  private async transitionActiveToTerminal(
    executionId: string,
    nextStatus: "cancelled" | "timed_out",
    errorClass: "cancelled" | "timeout",
    errorMessage: string,
  ): Promise<Execution> {
    const current = await this.requireExecution(executionId);
    if (current.status === nextStatus) {
      return current;
    }

    ExecutionStateMachine.assertTransition(executionId, current.status, nextStatus);
    const transitioned = await this.repository.transitionStatus(
      executionId,
      current.status,
      nextStatus,
      {
        errorClass,
        errorMessage,
        completedAt: this.timestamp(),
      },
    );
    if (transitioned) {
      return transitioned;
    }
    return this.resolveFailedTransition(executionId, current.status, nextStatus, true);
  }

  private async transition(
    executionId: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    patch: ExecutionUpdate,
    idempotentTerminal = false,
  ): Promise<Execution> {
    ExecutionStateMachine.assertTransition(executionId, expectedStatus, nextStatus);
    const transitioned = await this.repository.transitionStatus(
      executionId,
      expectedStatus,
      nextStatus,
      patch,
    );
    if (transitioned) {
      return transitioned;
    }
    return this.resolveFailedTransition(
      executionId,
      expectedStatus,
      nextStatus,
      idempotentTerminal,
    );
  }

  private async resolveFailedTransition(
    executionId: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    idempotentTerminal: boolean,
  ): Promise<Execution> {
    const current = await this.repository.get(executionId);
    if (!current) {
      throw new ExecutionNotFoundError(executionId);
    }
    if (idempotentTerminal && current.status === nextStatus) {
      return current;
    }
    if (current.status === expectedStatus) {
      throw new ExecutionTransitionConflictError(executionId, expectedStatus);
    }
    throw new InvalidExecutionTransitionError(executionId, current.status, nextStatus);
  }

  private async requireExecution(executionId: string): Promise<Execution> {
    const execution = await this.repository.get(executionId);
    if (!execution) {
      throw new ExecutionNotFoundError(executionId);
    }
    return execution;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
