import { describe, expect, it, vi } from "vitest";
import type { DirectorAgent } from "../../../src/core/agent/director/DirectorAgent.js";
import { ExecutionService } from "../../../src/core/execution/ExecutionService.js";
import { InflightLimiter } from "../../../src/core/execution/InflightLimiter.js";
import { ExecutionWorker } from "../../../src/server/worker/ExecutionWorker.js";
import type { ExecutionEventStore, NewExecutionEvent } from "../../../src/port/execution/ExecutionEventStore.js";
import type {
  CreateExecutionInput,
  ExecutionListOptions,
  ExecutionRepository,
  ExecutionUpdate,
  IdempotentCreateResult,
} from "../../../src/port/execution/ExecutionRepository.js";
import type { Execution } from "../../../src/port/execution/types.js";
import type { QueueMessage } from "../../../src/port/queue/MessageQueuePort.js";
import type { SessionMeta, SessionRepository } from "../../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../../src/port/user/TenantIsolationPort.js";
import { NodeContextStorageAdapter } from "../../../src/adapter/infra/NodeContextStorageAdapter.js";

class MemoryExecutionRepository implements ExecutionRepository {
  executions = new Map<string, Execution>();
  async create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>> {
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
  async transitionStatus(id: string, expected: Execution["status"], next: Execution["status"], patch: ExecutionUpdate = {}) {
    const current = this.executions.get(id);
    if (!current || current.status !== expected) return null;
    const updated = applyPatch({ ...current, status: next }, patch);
    this.executions.set(id, updated);
    return updated;
  }
  async delete(id: string) { return this.executions.delete(id); }
  async createTask(): Promise<never> { throw new Error("not used"); }
  async updateTask(): Promise<null> { return null; }
  async getTask(): Promise<null> { return null; }
  async listTasks() { return []; }
  async createAttempt(): Promise<never> { throw new Error("not used"); }
  async updateAttempt(): Promise<null> { return null; }
  async getAttempt(): Promise<null> { return null; }
  async listAttempts() { return []; }
}

class MemorySessionRepository implements SessionRepository {
  sessions = new Map<string, SessionMeta>();
  async create(input: SessionMeta) {
    this.sessions.set(input.id, input);
    return input;
  }
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
    id: "message-watchdog",
    queue: "executions",
    payload: { executionId, userId: "user-1", mode: "design" },
    priority: "normal",
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    userId: "user-1",
  };
}

describe("ExecutionWorker stream watchdog", () => {
  it("流永久挂死（信号失灵）时看门狗强制 timed_out 终态并释放 lane", async () => {
    const executions = new MemoryExecutionRepository();
    const sessions = new MemorySessionRepository();
    const events = new MemoryEventStore();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    let id = 0;
    const idGenerator = { randomUUID: () => `id-${++id}` };
    const service = new ExecutionService(executions, idGenerator);
    const created = await service.create({
      sessionId: "session-wd",
      idempotencyKey: "watchdog-1",
      requestPayload: { requirement: "design something", mode: "design", role: "chief_designer" },
    });
    await sessions.create({
      id: "session-wd",
      requirement: "design something",
      mode: "design",
      role: "chief_designer",
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 僵尸场景复现：Director 流永不产出事件、也不响应 abort（0bad5599 的挂死形态）
    const executeStream = async function* (): AsyncGenerator<never> { // eslint-disable-line require-yield -- 故意挂死：永不产出事件正是被测场景
      await new Promise(() => {});
    };

    const limiter = new InflightLimiter({ query: 1, design: 1 });
    const release = vi.fn(async () => {});
    const worker = new ExecutionWorker({
      queue: {
        publish: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        getStats: () => ({}),
        purge: () => {},
        start: () => {},
        stop: () => {},
        healthCheck: () => {},
      } as never,
      eventStore: events,
      executionRepositoryFactory: () => executions,
      sessionRepositoryFactory: () => sessions,
      userContextManager: {
        acquireConcurrencySlot: async () => true,
        releaseConcurrencySlot: release,
      } as never,
      contextStorage: storage,
      idGenerator,
      inflightLimiter: limiter,
      maxConcurrentPerUser: 2,
      pollIntervalMs: 10_000,
      taskTimeoutMs: 3_600_000,
      streamWatchdogMs: 60,
    });
    worker.setDirector({ executeStream } as unknown as DirectorAgent);

    const result = await worker.handleMessage(queueMessage(created.entity.id));
    expect(result.success).toBe(true);

    const execution = await executions.get(created.entity.id);
    expect(execution?.status).toBe("timed_out");
    expect(execution?.errorMessage ?? "").toContain("stalled");

    const terminal = events.events.find((e) => e.type === "execution_terminal");
    expect(terminal).toBeTruthy();

    // lane 与租户槽都已释放
    expect(limiter.counts()).toEqual({ query: 0, design: 0 });
    expect(release).toHaveBeenCalled();
  });
});
