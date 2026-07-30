import { beforeEach, describe, expect, test, vi } from "vitest";
import { Hono } from "hono";
import type { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import {
  consoleRoute,
  setConsoleExecutionDependencies,
  setDirector,
} from "../../src/server/routes/console.js";
import type { ExecutionEventStore, NewExecutionEvent } from "../../src/port/execution/ExecutionEventStore.js";
import type { ExecutionRepository } from "../../src/port/execution/ExecutionRepository.js";
import type { Execution, ExecutionStatus } from "../../src/port/execution/types.js";
import type { SessionMeta, SessionRepository } from "../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../src/port/user/TenantIsolationPort.js";

class RouteExecutionRepository {
  executions = new Map<string, Execution>();
  transitionStatus = vi.fn(async (
    id: string,
    expected: ExecutionStatus,
    next: ExecutionStatus,
    patch = {},
  ) => {
    const current = this.executions.get(id);
    if (!current || current.status !== expected) return null;
    const updated = { ...current, ...patch, status: next };
    this.executions.set(id, updated);
    return updated;
  });
  async create(input: {
    id: string;
    sessionId: string;
    idempotencyKey: string;
    requestPayload: Readonly<Record<string, unknown>>;
    deadlineAt?: string;
  }) {
    const existing = [...this.executions.values()].find(
      (item) => item.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { entity: existing, created: false };
    const now = new Date().toISOString();
    const entity: Execution = {
      ...input,
      userId: "user-1",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.executions.set(entity.id, entity);
    return { entity, created: true };
  }
  async get(id: string) { return this.executions.get(id) ?? null; }
  async list(options: { sessionId?: string } = {}) {
    return [...this.executions.values()].filter(
      (item) => !options.sessionId || item.sessionId === options.sessionId,
    );
  }
  async update() { return null; }
  async delete() { return false; }
  async createTask() { throw new Error("unused"); }
  async getTask() { return null; }
  async listTasks() { return []; }
  async transitionTaskStatus() { return null; }
  async createAttempt() { throw new Error("unused"); }
  async listAttempts() { return []; }
  async completeAttempt() { return null; }
}

class RouteSessionRepository implements SessionRepository {
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

class RouteEventStore implements ExecutionEventStore {
  events: Array<NewExecutionEvent & { cursor: string }> = [];
  subscribeStarted = vi.fn();
  async append(_userId: string, _executionId: string, event: NewExecutionEvent) {
    const stored = { ...event, cursor: `${this.events.length + 1}-0` };
    this.events.push(stored);
    return stored;
  }
  async list(_userId: string, _executionId: string, after = "0-0") {
    return this.events.filter((event) => event.cursor > after);
  }
  async replay(userId: string, executionId: string, after = "0-0") {
    return this.list(userId, executionId, after);
  }
  async *subscribe(
    _userId: string,
    _executionId: string,
    _after: string,
    signal?: AbortSignal,
  ) {
    this.subscribeStarted();
    await new Promise<void>((resolve) => {
      if (signal?.aborted) resolve();
      else signal?.addEventListener("abort", () => resolve(), { once: true });
    });
  }
  async purge() { return 0; }
  async health() { return true; }
  async close() {}
}

let repository: RouteExecutionRepository;
let sessions: RouteSessionRepository;
let events: RouteEventStore;
let publish: ReturnType<typeof vi.fn>;
let directorExecute: ReturnType<typeof vi.fn>;
let nextId: number;

function app(): Hono {
  const instance = new Hono();
  instance.use("*", async (c, next) => {
    c.set("tenant", {
      userId: "user-1",
      role: "user",
      sessionId: "auth-session",
    } satisfies TenantContext);
    await next();
  });
  instance.route("/console", consoleRoute);
  return instance;
}

beforeEach(() => {
  repository = new RouteExecutionRepository();
  sessions = new RouteSessionRepository();
  events = new RouteEventStore();
  publish = vi.fn(async () => ({}));
  directorExecute = vi.fn();
  nextId = 0;
  const worker = {
    setDirector: vi.fn(),
    hasDirector: () => true,
    hasActiveExecutions: () => false,
  };
  setConsoleExecutionDependencies({
    sessionRepositoryFactory: () => sessions,
    executionRepositoryFactory: () => repository as unknown as ExecutionRepository,
    queue: { publish } as never,
    eventStore: events,
    idGenerator: { randomUUID: () => `execution-${++nextId}` },
    worker: worker as never,
    maxRetries: 2,
  });
  setDirector({ execute: directorExecute } as unknown as DirectorAgent);
});

describe("console async execution control plane", () => {
  test("POST /execute 立即返回 202 且不等待 Director", async () => {
    const response = await app().request("/console/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirement: "test",
        mode: "query",
        sessionId: "session-1",
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      executionId: "execution-1",
      sessionId: "session-1",
      status: "queued",
      created: true,
    });
    expect(directorExecute).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test("重复 Idempotency-Key 不重复 publish", async () => {
    const request = (sessionId: string) => app().request("/console/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "same-request",
      },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId }),
    });

    const first = await request("session-1");
    const second = await request("session-1");

    expect(first.status).toBe(202);
    await expect(second.json()).resolves.toMatchObject({
      executionId: "execution-1",
      created: false,
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test("SSE 从 Last-Event-ID 重放并输出 cursor id", async () => {
    await events.append("user-1", "execution-1", {
      type: "chunk",
      data: { text: "old" },
      createdAt: new Date().toISOString(),
    });
    await events.append("user-1", "execution-1", {
      type: "execution_terminal",
      data: { status: "completed" },
      createdAt: new Date().toISOString(),
    });
    const response = await app().request("/console/execute/stream", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Last-Event-ID": "1-0",
      },
      body: JSON.stringify({
        requirement: "test",
        mode: "query",
        sessionId: "session-1",
      }),
    });
    const text = await response.text();

    expect(response.status).toBe(202);
    expect(text).not.toContain("data: {\"text\":\"old\"}");
    expect(text).toContain("id: 2-0");
    expect(text).toContain("event: execution_terminal");
  });

  test("SSE 客户端断开只停止订阅，不取消 execution", async () => {
    const response = await app().request("/console/execute/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requirement: "test",
        mode: "query",
        sessionId: "session-1",
      }),
    });
    await response.body?.cancel();

    expect(events.subscribeStarted).toHaveBeenCalled();
    expect((await repository.get("execution-1"))?.status).toBe("queued");
    expect(repository.transitionStatus).not.toHaveBeenCalled();
  });
});
