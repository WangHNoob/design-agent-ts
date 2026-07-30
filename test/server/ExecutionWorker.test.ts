import { describe, expect, test, vi } from "vitest";
import type { DirectorAgent, StreamEvent } from "../../src/core/agent/director/DirectorAgent.js";
import { ExecutionService } from "../../src/core/execution/ExecutionService.js";
import { ExecutionWorker } from "../../src/server/worker/ExecutionWorker.js";
import type { TaskResult } from "../../src/core/schema/TaskResult.js";
import type { ExecutionEventStore, NewExecutionEvent } from "../../src/port/execution/ExecutionEventStore.js";
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
} from "../../src/port/execution/ExecutionRepository.js";
import type {
  Execution,
  ExecutionAttempt,
  ExecutionStatus,
  ExecutionTask,
  ExecutionTaskStatus,
} from "../../src/port/execution/types.js";
import type { QueueMessage } from "../../src/port/queue/MessageQueuePort.js";
import type { SessionMeta, SessionRepository } from "../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../src/port/user/TenantIsolationPort.js";
import { NodeContextStorageAdapter } from "../../src/adapter/infra/NodeContextStorageAdapter.js";

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

function queueMessage(executionId: string, retryCount = 0, maxRetries = 1): QueueMessage<unknown> {
  return {
    id: "message-1",
    queue: "executions",
    payload: { executionId, userId: "user-1" },
    priority: "normal",
    createdAt: new Date().toISOString(),
    retryCount,
    maxRetries,
    userId: "user-1",
  };
}

async function fixture(director: DirectorAgent) {
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
    requestPayload: { requirement: "design", mode: "design", role: "chief_designer" },
  });
  await sessions.create({
    id: "session-1",
    requirement: "design",
    mode: "design",
    role: "chief_designer",
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const release = vi.fn(async () => {});
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
    maxConcurrentPerUser: 2,
    pollIntervalMs: 5,
    taskTimeoutMs: 1000,
  });
  worker.setDirector(director);
  return { worker, executions, sessions, events, storage, release, execution: created.entity, service };
}

describe("ExecutionWorker", () => {
  test("拒绝 payload/message userId 不一致且不进入 Director", async () => {
    const executeStream = vi.fn();
    const f = await fixture({ executeStream } as unknown as DirectorAgent);
    const message = {
      ...queueMessage(f.execution.id),
      payload: { executionId: f.execution.id, userId: "other-user" },
    };

    await expect(f.worker.handleMessage(message)).resolves.toMatchObject({
      success: false,
      retry: false,
      error: expect.stringContaining("does not match"),
    });
    expect(executeStream).not.toHaveBeenCalled();
  });

  test("执行真实事件、持久 task/attempt，并在 ALS 中运行且 finally 释放并发槽", async () => {
    let observedTenant: string | undefined;
    let storage: NodeContextStorageAdapter<TenantContext>;
    const director = {
      async *executeStream(): AsyncIterable<StreamEvent> {
        observedTenant = storage.getStore()?.userId;
        yield { type: "plan", data: { plan: {
          planId: "p1",
          requirement: "design",
          subTasks: [{
            id: "A", fragmentId: "A", domain: "system_design",
            description: "A", dependencies: [], priority: 1,
          }],
        } } };
        yield { type: "task_start", data: { taskId: "A", description: "A" } };
        yield { type: "task_complete", data: { taskId: "A", status: "success", output: "done" } };
        yield { type: "complete", data: { success: true, output: "done" } };
      },
    } as unknown as DirectorAgent;
    const f = await fixture(director);
    storage = f.storage;

    await expect(f.worker.handleMessage(queueMessage(f.execution.id))).resolves.toEqual({ success: true });
    expect(observedTenant).toBe("user-1");
    expect((await f.executions.get(f.execution.id))?.status).toBe("completed");
    expect((await f.executions.listTasks(f.execution.id))[0]?.status).toBe("success");
    expect([...f.executions.attempts.values()][0]?.status).toBe("success");
    expect(f.events.events.map((event) => event.type)).toContain("execution_terminal");
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  test("终态 redelivery 幂等 ACK，不再次调用 Director", async () => {
    const executeStream = vi.fn();
    const f = await fixture({ executeStream } as unknown as DirectorAgent);
    await f.service.claim(f.execution.id);
    await f.service.complete(f.execution.id);

    await expect(f.worker.handleMessage(queueMessage(f.execution.id))).resolves.toEqual({ success: true });
    expect(executeStream).not.toHaveBeenCalled();
  });

  test("running 崩溃恢复注入持久 plan 与已成功任务结果", async () => {
    let receivedOptions: { resumePlan?: unknown; initialTaskResults?: readonly TaskResult[] } | undefined;
    const director = {
      async *executeStream(
        _requirement: string,
        _sessionId: string,
        _mode: string,
        _role: string,
        _history: unknown,
        options: { resumePlan?: unknown; initialTaskResults?: readonly TaskResult[] },
      ): AsyncIterable<StreamEvent> {
        receivedOptions = options;
        yield { type: "complete", data: { success: true, output: "resumed" } };
      },
    } as unknown as DirectorAgent;
    const f = await fixture(director);
    await f.service.claim(f.execution.id);
    const plan = {
      planId: "resume-plan",
      requirement: "design",
      subTasks: [{
        id: "A", fragmentId: "A", domain: "system_design",
        description: "A", dependencies: [], priority: 1,
      }],
    };
    await f.executions.update(f.execution.id, { planPayload: { plan } });
    const task = (await f.executions.createTask({
      id: "task-A",
      executionId: f.execution.id,
      taskKey: "A",
      name: "A",
      inputPayload: { domain: "system_design" },
    })).entity;
    await f.executions.transitionTaskStatus(task.id, "pending", "running");
    await f.executions.transitionTaskStatus(task.id, "running", "success", {
      outputPayload: { output: "cached" },
    });

    await expect(f.worker.handleMessage(queueMessage(f.execution.id))).resolves.toEqual({ success: true });
    expect(receivedOptions?.resumePlan).toMatchObject({ planId: "resume-plan" });
    expect(receivedOptions?.initialTaskResults).toEqual([
      expect.objectContaining({ taskId: "A", status: "success", output: "cached" }),
    ]);
  });

  test("transient 在预算内 requeue，最后一次转 failed", async () => {
    const transient = { status: 503, message: "unavailable" };
    const director = {
      async *executeStream(): AsyncIterable<StreamEvent> { throw transient; },
    } as unknown as DirectorAgent;
    const first = await fixture(director);
    await expect(first.worker.handleMessage(queueMessage(first.execution.id, 0, 1)))
      .resolves.toMatchObject({ success: false, retry: true });
    expect((await first.executions.get(first.execution.id))?.status).toBe("queued");

    const last = await fixture(director);
    await expect(last.worker.handleMessage(queueMessage(last.execution.id, 1, 1)))
      .resolves.toMatchObject({ success: false, retry: false });
    expect((await last.executions.get(last.execution.id))?.status).toBe("failed");
  });

  test("轮询持久取消并跨实例 abort Director", async () => {
    const director = {
      async *executeStream(
        _requirement: string,
        _sessionId: string,
        _mode: string,
        _role: string,
        _history: unknown,
        options: { signal: AbortSignal },
      ): AsyncIterable<StreamEvent> {
        await new Promise<void>((resolve) =>
          options.signal.addEventListener("abort", () => resolve(), { once: true }));
        yield { type: "error", data: { error: "cancelled" } };
      },
    } as unknown as DirectorAgent;
    const f = await fixture(director);
    const running = f.worker.handleMessage(queueMessage(f.execution.id));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await f.service.cancel(f.execution.id);

    await expect(running).resolves.toEqual({ success: true });
    expect((await f.executions.get(f.execution.id))?.status).toBe("cancelled");
    expect(f.release).toHaveBeenCalledTimes(1);
  });
});
