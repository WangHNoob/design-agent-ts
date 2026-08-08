import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import type { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import type { ExecutionEventStore, NewExecutionEvent } from "../../src/port/execution/ExecutionEventStore.js";
import type {
  CreateExecutionAttemptInput,
  CreateExecutionInput,
  CreateExecutionTaskInput,
  Execution,
  ExecutionAttempt,
  ExecutionListOptions,
  ExecutionRepository,
  ExecutionTask,
  ExecutionUpdate,
  ExecutionTaskTransition,
  IdempotentCreateResult,
} from "../../src/port/execution/ExecutionRepository.js";
import type { HITLCheckpoint, HITLRepository, HITLReviewInput } from "../../src/port/hitl/HITLRepository.js";
import type { SessionMeta, SessionRepository } from "../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../src/port/user/TenantIsolationPort.js";
import { ExecutionService } from "../../src/core/execution/ExecutionService.js";
import { ExecutionWorker, EXECUTION_QUEUE } from "../../src/server/worker/ExecutionWorker.js";
import { InflightLimiter } from "../../src/core/execution/InflightLimiter.js";
import { NodeContextStorageAdapter } from "../../src/adapter/infra/NodeContextStorageAdapter.js";
import { hitlRoute, setHITLRouteDependencies } from "../../src/server/routes/hitl.js";
import type { QueueMessage } from "../../src/port/queue/MessageQueuePort.js";
import type { ExecutionStatus } from "../../src/port/execution/ExecutionRepository.js";

function tenantApp(userId: string): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("tenant", { userId, role: "admin", sessionId: `auth-${userId}` } satisfies TenantContext);
    await next();
  });
  return app;
}

function applyPatch<T extends object>(current: T, patch: object): T {
  const next = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as T;
}

class MemoryExecutionRepository implements ExecutionRepository {
  executions = new Map<string, Execution>();
  tasks = new Map<string, ExecutionTask>();
  attempts = new Map<string, ExecutionAttempt>();
  private seq = 0;

  async create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>> {
    const entity: Execution = {
      ...input,
      id: `exec-${++this.seq}`,
      userId: "user-a",
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
    const entity: ExecutionTask = {
      id: input.id,
      userId: "user-a",
      executionId: input.executionId,
      taskKey: input.taskKey,
      name: input.name,
      agentName: input.agentName,
      status: "pending",
      dependencies: input.dependencies ?? [],
      inputPayload: input.inputPayload ?? {},
      position: input.position ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    expected: ExecutionTask["status"],
    next: ExecutionTask["status"],
    patch: ExecutionTaskTransition = {},
  ) {
    const current = this.tasks.get(id);
    if (!current || current.status !== expected) return null;
    const updated = applyPatch({ ...current, status: next }, patch);
    this.tasks.set(id, updated);
    return updated;
  }
  async createAttempt(input: CreateExecutionAttemptInput): Promise<IdempotentCreateResult<ExecutionAttempt>> {
    const entity: ExecutionAttempt = {
      id: input.id,
      userId: "user-a",
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
  async completeAttempt(id: string, input: Parameters<ExecutionRepository["completeAttempt"]>[1]) {
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

function queueMessage(executionId: string, mode: "design" | "query" | "table"): QueueMessage<unknown> {
  return {
    id: "resume-message-1",
    queue: EXECUTION_QUEUE,
    payload: { executionId, userId: "user-a", mode },
    priority: "normal",
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 1,
    userId: "user-a",
  };
}

/**
 * Full HITL loop through the real route + service + worker:
 *   design flow pauses at waiting_hitl → human approves via POST review →
 *   execution resumes and is re-published → worker re-consumes → completed.
 */
describe("HITL approve → resume → worker → completed (full flow)", () => {
  test("approve transitions waiting_hitl → queued → completed with persisted output", async () => {
    const executions = new MemoryExecutionRepository();
    const sessions = new MemorySessionRepository();
    const events = new MemoryEventStore();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    let id = 0;
    const idGenerator = { randomUUID: () => `id-${++id}` };
    const service = new ExecutionService(executions, idGenerator);

    // 1) execution created (queued) → running → waiting_hitl
    const created = await service.create({
      sessionId: "session-h",
      idempotencyKey: "req-h",
      requestPayload: { requirement: "设计一套装备系统", mode: "design", role: "chief_designer" },
    });
    await sessions.create({
      id: "session-h",
      requirement: "设计一套装备系统",
      mode: "design",
      role: "chief_designer",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await service.claim(created.entity.id);
    await service.pause(created.entity.id, { resumeCursor: "after_plan" });

    // 2) checkpoint waiting for review
    const checkpoint: HITLCheckpoint = {
      id: "checkpoint-h",
      sessionId: "session-h",
      stage: "plan",
      status: "waiting_review",
      content: "# Plan",
      contentType: "markdown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "user-a",
      executionId: created.entity.id,
      reviewPoint: "hitl-1-task-plan",
      resumeCursor: "after_plan",
      fallback: false,
    };
    let reviewInput: HITLReviewInput | undefined;
    const hitlRepo: HITLRepository = {
      async get(id) { return id === checkpoint.id ? checkpoint : null; },
      async review(id, input) {
        reviewInput = input;
        return { ...checkpoint, status: "approved", reviewerId: input.reviewerId, reviewedAt: input.reviewedAt };
      },
      async expire() { return null; },
      async escalate() { return null; },
      async listPending() { return [checkpoint]; },
      async listBySession() { return [checkpoint]; },
    };

    // 3) wire the real route deps: real repos/service/queue (captured)
    const publish = vi.fn(async () => {});
    const lock = {
      key: "lock-h",
      holderId: "test",
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    setHITLRouteDependencies({
      repositoryFactory: () => hitlRepo,
      executionRepositoryFactory: () => executions,
      sessionRepositoryFactory: () => sessions,
      queue: { publish } as never,
      tenantPort: {
        scopeKey: (_u: string, r: string, k?: string) => (k ? `${r}:${k}` : r),
        acquireLock: vi.fn(async () => lock),
        releaseLock: vi.fn(async () => true),
      } as never,
      idGenerator,
      maxRetries: 1,
      timeoutMs: 300_000,
      freshness: undefined,
    });

    const app = tenantApp("user-a");
    app.route("/hitl", hitlRoute);

    // 4) human approves
    const reviewRes = await app.request("/hitl/checkpoints/checkpoint-h/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", comment: "计划 OK" }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();
    expect(reviewBody.execution.status).toBe("queued");
    expect(reviewInput?.reviewerId).toBe("user-a");
    expect(publish).toHaveBeenCalledTimes(1);
    const published = publish.mock.calls[0]![1] as { executionId: string; userId: string; mode: string };
    expect(published.executionId).toBe(created.entity.id);
    expect(published.mode).toBe("design");
    expect((await sessions.get("session-h"))?.status).toBe("queued");

    // 5) worker re-consumes the resume message and completes the design flow
    const director = {
      async *executeStream(): AsyncIterable<never> {
        yield { type: "plan", data: { message: "plan", plan: { planId: "p1", requirement: "设计一套装备系统", subTasks: [] } } } as never;
        yield { type: "task_start", data: { taskId: "A", description: "装备系统" } } as never;
        yield { type: "task_complete", data: { taskId: "A", status: "success", output: "装备系统设计完成" } } as never;
        yield { type: "complete", data: { success: true, output: "装备系统设计完成" } } as never;
      },
    } as unknown as DirectorAgent;

    const worker = new ExecutionWorker({
      queue: { publish } as never,
      eventStore: events,
      executionRepositoryFactory: () => executions,
      sessionRepositoryFactory: () => sessions,
      userContextManager: {
        acquireConcurrencySlot: vi.fn(async () => true),
        releaseConcurrencySlot: vi.fn(async () => {}),
      } as never,
      contextStorage: storage,
      idGenerator,
      inflightLimiter: new InflightLimiter({ query: 8, design: 8 }),
      maxConcurrentPerUser: 2,
      pollIntervalMs: 5,
      taskTimeoutMs: 1000,
    });
    worker.setDirector(director);

    const result = await worker.handleMessage(queueMessage(created.entity.id, "design"));
    expect(result.success).toBe(true);

    const finalExec = await executions.get(created.entity.id);
    expect(finalExec?.status).toBe("completed");
    expect((finalExec?.resultPayload as { output?: string } | undefined)?.output).toContain("装备系统设计完成");
    expect((await sessions.get("session-h"))?.status).toBe("completed");
  });
});
