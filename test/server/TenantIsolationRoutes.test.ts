import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import type { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import type { UserContextManager } from "../../src/core/user/UserContextManager.js";
import type {
  HITLCheckpoint,
  HITLRepository,
  HITLReviewInput,
} from "../../src/port/hitl/HITLRepository.js";
import type { SessionMeta, SessionRepository } from "../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../src/port/user/TenantIsolationPort.js";
import {
  consoleRoute,
  setConsoleExecutionDependencies,
  setDirector,
} from "../../src/server/routes/console.js";
import {
  hitlRoute,
  setHITLRepositoryFactory,
} from "../../src/server/routes/hitl.js";
import {
  sessionsRoute,
  setSessionRepositoryFactory,
  setWorkspaceManager,
} from "../../src/server/routes/sessions.js";
import {
  requireAdmin,
} from "../../src/server/middleware/auth.js";

function tenant(userId: string, role: TenantContext["role"] = "user"): TenantContext {
  return { userId, role, sessionId: `auth-${userId}` };
}

function tenantApp(userId: string, role: TenantContext["role"] = "user"): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("tenant", tenant(userId, role));
    await next();
  });
  return app;
}

class MemorySessionRepository implements SessionRepository {
  constructor(private readonly sessions = new Map<string, SessionMeta>()) {}
  async create(meta: SessionMeta): Promise<void> {
    this.sessions.set(meta.id, meta);
  }
  async update(id: string, patch: Partial<SessionMeta>): Promise<void> {
    const current = this.sessions.get(id);
    if (current) this.sessions.set(id, { ...current, ...patch });
  }
  async get(id: string): Promise<SessionMeta | null> {
    return this.sessions.get(id) ?? null;
  }
  async list(): Promise<SessionMeta[]> {
    return [...this.sessions.values()];
  }
  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }
}

const sessionA: SessionMeta = {
  id: "session-a",
  requirement: "A",
  mode: "design",
  role: "chief_designer",
  status: "completed",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const checkpointA: HITLCheckpoint = {
  id: "checkpoint-a",
  sessionId: "session-a",
  stage: "plan",
  status: "waiting_review",
  content: "# Plan",
  contentType: "markdown",
  createdAt: "2026-07-30T00:00:00.000Z",
  userId: "user-a",
  reviewPoint: "hitl-1-task-plan",
  fallback: false,
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("tenant-bound session and HITL routes", () => {
  test("keeps another tenant's session and download invisible", async () => {
    const repositories = new Map([
      ["user-a", new MemorySessionRepository(new Map([["session-a", sessionA]]))],
      ["user-b", new MemorySessionRepository()],
    ]);
    setSessionRepositoryFactory((userId) => repositories.get(userId)!);
    const readWorkspaceFile = vi.fn();
    setWorkspaceManager({ readWorkspaceFile } as never);
    const app = tenantApp("user-b");
    app.route("/sessions", sessionsRoute);

    const [metadata, download] = await Promise.all([
      app.request("/sessions/session-a"),
      app.request("/sessions/session-a/files/download?path=task/output.md"),
    ]);

    expect(metadata.status).toBe(404);
    expect(download.status).toBe(404);
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  test("keeps another tenant's HITL checkpoint invisible", async () => {
    setHITLRepositoryFactory((userId) => ({
      async get(id) {
        return userId === "user-a" && id === checkpointA.id ? checkpointA : null;
      },
    } as HITLRepository));
    const app = tenantApp("user-b");
    app.route("/hitl", hitlRoute);

    const response = await app.request("/hitl/checkpoints/checkpoint-a");

    expect(response.status).toBe(404);
  });

  test("takes reviewerId from the authenticated tenant", async () => {
    let reviewInput: HITLReviewInput | undefined;
    setHITLRepositoryFactory(() => ({
      async get(id) {
        return id === checkpointA.id ? checkpointA : null;
      },
      async review(_id, input) {
        reviewInput = input;
        return { ...checkpointA, status: "approved", reviewerId: input.reviewerId };
      },
    } as HITLRepository));
    const app = tenantApp("user-a");
    app.route("/hitl", hitlRoute);

    const response = await app.request("/hitl/checkpoints/checkpoint-a/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", reviewerId: "spoofed-user" }),
    });

    expect(response.status).toBe(200);
    expect(reviewInput?.reviewerId).toBe("user-a");
  });
});

describe("system-write RBAC", () => {
  test("rejects a regular user and permits an admin", async () => {
    const userApp = tenantApp("user-a", "user");
    userApp.post("/system-write", requireAdmin(), (c) => c.json({ success: true }));
    const adminApp = tenantApp("admin-a", "admin");
    adminApp.post("/system-write", requireAdmin(), (c) => c.json({ success: true }));

    const userResponse = await userApp.request("/system-write", { method: "POST" });
    const adminResponse = await adminApp.request("/system-write", { method: "POST" });

    expect(userResponse.status).toBe(403);
    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toMatchObject({ success: true });
  });
});

describe("console tenant slot lifecycle", () => {
  test("releases the slot after a successful execute", async () => {
    const repository = new MemorySessionRepository();
    const release = vi.fn(async () => {});
    setConsoleExecutionDependencies(
      () => repository,
      {
        acquireConcurrencySlot: async () => true,
        releaseConcurrencySlot: release,
      } as unknown as UserContextManager,
      2,
    );
    setDirector({
      execute: vi.fn(async () => ({
        agentName: "director",
        message: null,
        metadata: {},
        success: true,
        errorMessage: null,
      })),
    } as unknown as DirectorAgent);
    const app = tenantApp("user-a");
    app.route("/console", consoleRoute);

    const response = await app.request("/console/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId: "execute-success" }),
    });

    expect(response.status).toBe(200);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("releases the slot when execute fails", async () => {
    const repository = new MemorySessionRepository();
    const acquire = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    setConsoleExecutionDependencies(
      () => repository,
      { acquireConcurrencySlot: acquire, releaseConcurrencySlot: release } as unknown as UserContextManager,
      2,
    );
    setDirector({
      execute: vi.fn(async () => {
        throw new Error("execute failed");
      }),
    } as unknown as DirectorAgent);
    const app = tenantApp("user-a");
    app.route("/console", consoleRoute);

    const response = await app.request("/console/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId: "execute-failure" }),
    });

    expect(response.status).toBe(500);
    expect(acquire).toHaveBeenCalledWith(tenant("user-a"), 2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("releases the slot when a stream fails", async () => {
    const repository = new MemorySessionRepository();
    const acquire = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    setConsoleExecutionDependencies(
      () => repository,
      { acquireConcurrencySlot: acquire, releaseConcurrencySlot: release } as unknown as UserContextManager,
      2,
    );
    setDirector({
      async *executeStream() {
        throw new Error("stream failed");
      },
    } as unknown as DirectorAgent);
    const app = tenantApp("user-a");
    app.route("/console", consoleRoute);

    const response = await app.request("/console/execute/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId: "stream-failure" }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("stream failed");
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("releases the slot after a successful stream", async () => {
    const repository = new MemorySessionRepository();
    const release = vi.fn(async () => {});
    setConsoleExecutionDependencies(
      () => repository,
      {
        acquireConcurrencySlot: async () => true,
        releaseConcurrencySlot: release,
      } as unknown as UserContextManager,
      2,
    );
    setDirector({
      async *executeStream() {
        yield { type: "complete", data: { output: "done" } };
      },
    } as unknown as DirectorAgent);
    const app = tenantApp("user-a");
    app.route("/console", consoleRoute);

    const response = await app.request("/console/execute/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId: "stream-success" }),
    });
    await response.text();

    expect(release).toHaveBeenCalledTimes(1);
  });

  test("keeps cancellation tenant-scoped and releases in execution finally", async () => {
    const repository = new MemorySessionRepository();
    const release = vi.fn(async () => {});
    setConsoleExecutionDependencies(
      () => repository,
      {
        acquireConcurrencySlot: async () => true,
        releaseConcurrencySlot: release,
      } as unknown as UserContextManager,
      2,
    );
    setDirector({
      execute(
        _requirement: string,
        _sessionId: string,
        _mode: string,
        _role: string,
        _history: unknown,
        options: { signal: AbortSignal },
      ) {
        return new Promise((resolve) => {
          options.signal.addEventListener("abort", () => resolve({
            agentName: "director",
            message: null,
            metadata: {},
            success: false,
            errorMessage: "Cancelled by user",
          }), { once: true });
        });
      },
    } as unknown as DirectorAgent);
    const app = tenantApp("user-a");
    app.route("/console", consoleRoute);
    const execution = app.request("/console/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requirement: "test", mode: "query", sessionId: "cancel-me" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const cancellation = await app.request("/console/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "cancel-me" }),
    });
    const executionResponse = await execution;

    expect(cancellation.status).toBe(200);
    expect(executionResponse.status).toBe(200);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
