import { describe, expect, test } from "vitest";
import {
  ExecutionService,
  ExecutionTransitionConflictError,
} from "../../../src/core/execution/ExecutionService.js";
import { InvalidExecutionTransitionError } from "../../../src/core/execution/ExecutionStateMachine.js";
import type {
  CompleteExecutionAttemptInput,
  CreateExecutionAttemptInput,
  CreateExecutionInput,
  CreateExecutionTaskInput,
  ExecutionListOptions,
  ExecutionRepository,
  ExecutionTaskTransition,
  ExecutionUpdate,
  IdempotentCreateResult,
} from "../../../src/port/execution/ExecutionRepository.js";
import type {
  Execution,
  ExecutionAttempt,
  ExecutionStatus,
  ExecutionTask,
  ExecutionTaskStatus,
} from "../../../src/port/execution/types.js";

class InMemoryExecutionRepository implements ExecutionRepository {
  readonly executions = new Map<string, Execution>();
  getCalls = 0;
  failNextTransition = false;

  async create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>> {
    const existing = [...this.executions.values()]
      .find((execution) => execution.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return { entity: existing, created: false };
    }
    const now = "2026-07-30T02:00:00.000Z";
    const execution: Execution = {
      ...input,
      userId: "user-1",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.executions.set(execution.id, execution);
    return { entity: execution, created: true };
  }

  async get(id: string): Promise<Execution | null> {
    this.getCalls += 1;
    return this.executions.get(id) ?? null;
  }

  async list(options?: ExecutionListOptions): Promise<Execution[]> {
    return [...this.executions.values()].filter(
      (execution) => !options?.status || execution.status === options.status,
    );
  }

  async update(id: string, patch: ExecutionUpdate): Promise<Execution | null> {
    const execution = this.executions.get(id);
    if (!execution) return null;
    const updated = this.applyPatch(execution, patch);
    this.executions.set(id, updated);
    return updated;
  }

  async transitionStatus(
    id: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    patch: ExecutionUpdate = {},
  ): Promise<Execution | null> {
    const execution = this.executions.get(id);
    if (!execution || execution.status !== expectedStatus) return null;
    if (this.failNextTransition) {
      this.failNextTransition = false;
      return null;
    }
    const updated = this.applyPatch({ ...execution, status: nextStatus }, patch);
    this.executions.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.executions.delete(id);
  }

  async createTask(_input: CreateExecutionTaskInput): Promise<IdempotentCreateResult<ExecutionTask>> {
    throw new Error("not implemented");
  }

  async getTask(_id: string): Promise<ExecutionTask | null> {
    return null;
  }

  async listTasks(_executionId: string): Promise<ExecutionTask[]> {
    return [];
  }

  async transitionTaskStatus(
    _id: string,
    _expectedStatus: ExecutionTaskStatus,
    _nextStatus: ExecutionTaskStatus,
    _patch?: ExecutionTaskTransition,
  ): Promise<ExecutionTask | null> {
    return null;
  }

  async createAttempt(
    _input: CreateExecutionAttemptInput,
  ): Promise<IdempotentCreateResult<ExecutionAttempt>> {
    throw new Error("not implemented");
  }

  async listAttempts(_taskId: string): Promise<ExecutionAttempt[]> {
    return [];
  }

  async completeAttempt(
    _id: string,
    _input: CompleteExecutionAttemptInput,
  ): Promise<ExecutionAttempt | null> {
    return null;
  }

  private applyPatch(execution: Execution, patch: ExecutionUpdate): Execution {
    const updated = { ...execution, updatedAt: "2026-07-30T03:00:00.000Z" };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete (updated as unknown as Record<string, unknown>)[key];
      } else if (value !== undefined) {
        (updated as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return updated;
  }
}

const idGenerator = {
  next: 0,
  randomUUID() {
    this.next += 1;
    return `execution-${this.next}`;
  },
};
const fixedNow = () => new Date("2026-07-30T04:00:00.000Z");

describe("ExecutionService", () => {
  test("creates idempotently through the repository", async () => {
    const repository = new InMemoryExecutionRepository();
    const service = new ExecutionService(repository, idGenerator, fixedNow);
    const command = {
      sessionId: "session-1",
      idempotencyKey: "request-1",
      requestPayload: { requirement: "design" },
    };

    const first = await service.create(command);
    const second = await service.create(command);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entity.id).toBe(first.entity.id);
  });

  test("runs claim, pause, resume and completion transitions", async () => {
    const repository = new InMemoryExecutionRepository();
    const service = new ExecutionService(repository, idGenerator, fixedNow);
    const created = await service.create({
      sessionId: "session-2",
      idempotencyKey: "request-2",
      requestPayload: {},
    });

    await expect(service.claim(created.entity.id)).resolves.toMatchObject({ status: "running" });
    await expect(service.pause(created.entity.id, { resumeCursor: "task-B" }))
      .resolves.toMatchObject({ status: "waiting_hitl", resumeCursor: "task-B" });
    await expect(service.resume(created.entity.id, { approved: true }))
      .resolves.toMatchObject({ status: "queued", resumePayload: { approved: true } });
    await service.claim(created.entity.id);
    const completed = await service.complete(created.entity.id, { resultPayload: { ok: true } });

    expect(completed).toMatchObject({
      status: "completed",
      resultPayload: { ok: true },
      completedAt: fixedNow().toISOString(),
    });
    await expect(service.complete(created.entity.id)).resolves.toEqual(completed);
  });

  test("rejects illegal transitions", async () => {
    const repository = new InMemoryExecutionRepository();
    const service = new ExecutionService(repository, idGenerator, fixedNow);
    const created = await service.create({
      sessionId: "session-3",
      idempotencyKey: "request-3",
      requestPayload: {},
    });

    await expect(service.complete(created.entity.id)).rejects.toBeInstanceOf(
      InvalidExecutionTransitionError,
    );
  });

  test("re-reads a failed conditional transition to expose a race", async () => {
    const repository = new InMemoryExecutionRepository();
    const service = new ExecutionService(repository, idGenerator, fixedNow);
    const created = await service.create({
      sessionId: "session-4",
      idempotencyKey: "request-4",
      requestPayload: {},
    });
    repository.failNextTransition = true;

    await expect(service.claim(created.entity.id)).rejects.toBeInstanceOf(
      ExecutionTransitionConflictError,
    );
    expect(repository.getCalls).toBe(1);
  });

  test("classifies failures into failed, cancelled and timed_out terminals", async () => {
    const repository = new InMemoryExecutionRepository();
    const service = new ExecutionService(repository, idGenerator, fixedNow);

    const transient = await service.create({
      sessionId: "session-5",
      idempotencyKey: "request-5",
      requestPayload: {},
    });
    await service.claim(transient.entity.id);
    await expect(service.fail(transient.entity.id, { status: 503, message: "unavailable" }))
      .resolves.toMatchObject({ status: "failed", errorClass: "transient" });

    const cancelled = await service.create({
      sessionId: "session-6",
      idempotencyKey: "request-6",
      requestPayload: {},
    });
    await service.claim(cancelled.entity.id);
    await expect(service.fail(cancelled.entity.id, new DOMException("aborted", "AbortError")))
      .resolves.toMatchObject({ status: "cancelled", errorClass: "cancelled" });

    const timedOut = await service.create({
      sessionId: "session-7",
      idempotencyKey: "request-7",
      requestPayload: {},
    });
    await service.claim(timedOut.entity.id);
    const timeoutError = new Error("deadline timeout");
    timeoutError.name = "TimeoutError";
    await expect(service.fail(timedOut.entity.id, timeoutError))
      .resolves.toMatchObject({ status: "timed_out", errorClass: "timeout" });
  });
});
