import { describe, expect, test, vi } from "vitest";
import type { DirectorAgent } from "../../../src/core/agent/director/DirectorAgent.js";
import { ExecutionService } from "../../../src/core/execution/ExecutionService.js";
import { InflightLimiter } from "../../../src/core/execution/InflightLimiter.js";
import { ExecutionWorker } from "../../../src/server/worker/ExecutionWorker.js";
import type { ExecutionEventStore, NewExecutionEvent } from "../../../src/port/execution/ExecutionEventStore.js";
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
import type { QueueMessage } from "../../../src/port/queue/MessageQueuePort.js";
import type { SessionMeta, SessionRepository } from "../../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../../src/port/user/TenantIsolationPort.js";
import { NodeContextStorageAdapter } from "../../../src/adapter/infra/NodeContextStorageAdapter.js";

class MemoryExecutionRepository implements ExecutionRepository {
  executions = new Map<string, Execution>();
  tasks = new Map<string, ExecutionTask>();
  attempts = new Map<string, ExecutionAttempt>();

  async create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>> {
    const existing = [...this.executions.values()].find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return { entity: existing, created: false };
    const entity: Execution = {
      ...input,
      userId: "user-1",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.executions.set(entity.id, entity);
    return { entity, created: true };
  }
  async get(id: string) { return this.executions.get(id) ?? null; }
  async list(options: ExecutionListOptions = {}) {
    return [...this.executions.values()].filter((item) =>
      (!options.status || item.status === options.status)
      && (!options.sessionId || item.sessionId === options.sessionId));
  }
  async update(id: string, patch: ExecutionUpdate) {
    const current = this.executions.get(id);
    if (!current) return null;
    const next = applyPatch(current, patch);
    this.executions.set(id, next);
    return next;
  }
  async transitionStatus(id: string, expected: ExecutionStatus, next: ExecutionStatus, patch: ExecutionUpdate = {}) {
    const current = this.executions.get(id);
    if (!current || current.status !== expected) return null;
    const updated = applyPatch({ ...current, status: next }, patch);
    this.executions.set(id, updated);
    return updated;
  }
  async delete(id: string) { return this.executions.delete(id); }
  async createTask(input: CreateExecutionTaskInput): Promise<IdempotentCreateResult<ExecutionTask>> {
    const existing = [...this.tasks.values()].find((item) =>
      item.executionId === input.executionId && item.taskKey === input.taskKey);
    if (existing) return { entity: existing, created: false };
    const now = new Date().toISOString();
    const entity: ExecutionTask = {
      id: input.id,
      userId: "user-1",
      executionId: input.executionId,
      taskKey: input.taskKey,
      name: input.name,
      agentName: input.agentName,
      status: "pending",
      dependencies: input.dependencies ?? [],
      inputPayload: input.inputPayload ?? {},
      position: input.position ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(entity.id, entity);
    return { entity, created: true };
  }
  async getTask(id: string) { return this.tasks.get(id) ?? null; }
  async listTasks(executionId: string) {
    return [...this.tasks.values()].filter((item) => item.executionId === executionId);
  }
  async transitionTaskStatus(
    id: string,
    expected: ExecutionTaskStatus,
    next: ExecutionTaskStatus,
    patch: ExecutionTaskTransition = {},
  ) {
    const current = this.tasks.get(id);
    if (!current || current.status !== expected) return null;
    const updated = applyPatch({ ...current, status: next }, patch);
    this.tasks.set(id, updated);
    return updated;
  }
  async createAttempt(input: CreateExecutionAttemptInput): Promise<IdempotentCreateResult<ExecutionAttempt>> {
    const existing = [...this.attempts.values()].find((item) =>
      item.taskId === input.taskId && item.attemptNumber === input.attemptNumber);
    if (existing) return { entity: existing, created: false };
    const entity: ExecutionAttempt = {
      id: input.id,
      userId: "user-1",
      executionId: input.executionId,
      taskId: input.taskId,
      attemptNumber: input.attemptNumber,
      status: "running",
      inputPayload: input.inputPayload ?? {},
      startedAt: input.startedAt ?? new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.attempts.set(entity.id, entity);
    return { entity, created: true };
  }
  async listAttempts(taskId: string) {
    return [...this.attempts.values()].filter((item) => item.taskId === taskId);
  }
  async completeAttempt(id: string, input: CompleteExecutionAttemptInput) {
    const current = this.attempts.get(id);
    if (!current || current.status !== "running") return null;
    const updated = applyPatch(current, input);
    this.attempts.set(id, updated);
    return updated;
  }
}

class MemorySessionRepository implements SessionRepository {
  sessions = new Map<string, SessionMeta>();
  async create(meta: SessionMeta) { this.sessions.set(meta.id, meta); }
  async update(id: string, patch: Partial<SessionMeta>) {
    const current = this.sessions.get(id);
    if (current) this.sessions.set(id, { ...current, ...patch });
  }
  async get(id: string) { return this.sessions.get(id) ?? null; }
  async list() { return [...this.sessions.values()]; }
  async delete(id: string) { return this.sessions.delete(id); }
}

class MemoryEventStore implements ExecutionEventStore {
  events: Array<NewExecutionEvent & { cursor: string }> = [];
  async append(_userId: string, _executionId: string, event: NewExecutionEvent) {
    const stored = { ...event, cursor: `${this.events.length + 1}-0` };
    this.events.push(stored);
    return stored;
  }
  async list() { return this.events; }
  async replay() { return this.events; }
  async *subscribe() { yield* this.events; }
  async purge() { return 0; }
  async health() { return true; }
  async close() {}
}

function applyPatch<T extends object>(current: T, patch: object): T {
  const next = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as T;
}

function queueMessage(executionId: string): QueueMessage<unknown> {
  return {
    id: "message-1",
    queue: "executions",
    payload: { executionId, userId: "user-1", mode: "query" },
    priority: "normal",
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    userId: "user-1",
  };
}

describe("ExecutionWorker inflight lanes", () => {
  test("tryAcquire false → defer 且不调用 Director，并释放租户槽", async () => {
    const executeStream = vi.fn();
    const executions = new MemoryExecutionRepository();
    const sessions = new MemorySessionRepository();
    const events = new MemoryEventStore();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    let id = 0;
    const idGenerator = { randomUUID: () => `id-${++id}` };
    const service = new ExecutionService(executions, idGenerator);
    const created = await service.create({
      sessionId: "session-1",
      idempotencyKey: "request-1",
      requestPayload: { requirement: "q", mode: "query", role: "chief_designer" },
    });
    await sessions.create({
      id: "session-1",
      requirement: "q",
      mode: "query",
      role: "chief_designer",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const release = vi.fn(async () => {});
    const limiter = new InflightLimiter({ query: 1, design: 1 });
    expect(limiter.tryAcquire("query")).toBe(true);

    const worker = new ExecutionWorker({
      queue: {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        getStats: vi.fn(),
        purge: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        healthCheck: vi.fn(),
      } as never,
      eventStore: events,
      executionRepositoryFactory: () => executions,
      sessionRepositoryFactory: () => sessions,
      userContextManager: {
        acquireConcurrencySlot: vi.fn(async () => true),
        releaseConcurrencySlot: release,
      } as never,
      contextStorage: storage,
      idGenerator,
      inflightLimiter: limiter,
      maxConcurrentPerUser: 2,
      pollIntervalMs: 5,
      taskTimeoutMs: 1000,
    });
    worker.setDirector({ executeStream } as unknown as DirectorAgent);

    await expect(worker.handleMessage(queueMessage(created.entity.id))).resolves.toEqual({
      success: false,
      defer: true,
      error: "Execution inflight lane full",
    });

    expect(executeStream).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect((await executions.get(created.entity.id))?.status).toBe("queued");
    expect((await sessions.get("session-1"))?.status).toBe("queued");
    expect(limiter.counts()).toEqual({ query: 1, design: 0 });
  });
});
