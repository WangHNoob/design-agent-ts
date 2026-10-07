import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type {
  Execution,
  ExecutionRepository,
} from "../../src/port/execution/types.js";
import type { SessionMeta, SessionRepository } from "../../src/port/session/SessionRepository.js";
import type { TenantContext } from "../../src/port/user/TenantIsolationPort.js";
import {
  sessionsRoute,
  setExecutionRepositoryFactory,
  setSessionRepositoryFactory,
} from "../../src/server/routes/sessions.js";

function tenant(userId: string): TenantContext {
  return { userId, role: "user", sessionId: `auth-${userId}` };
}

function tenantApp(userId: string): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("tenant", tenant(userId));
    await next();
  });
  return app;
}

const sessionA: SessionMeta = {
  id: "session-a",
  requirement: "第三轮需求",
  mode: "query",
  role: "chief_designer",
  status: "completed",
  createdAt: "2026-10-07T10:00:00.000Z",
  updatedAt: "2026-10-07T10:30:00.000Z",
};

function execution(
  overrides: Partial<Execution> & Pick<Execution, "id" | "createdAt">,
): Execution {
  return {
    userId: "user-a",
    sessionId: "session-a",
    idempotencyKey: `key-${overrides.id}`,
    status: "completed",
    requestPayload: { requirement: "默认需求", mode: "query", role: "chief_designer" },
    mode: "query",
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

/** 只实现被测路径用到的 list/get，其余方法不应被路由触达。 */
function fakeExecutionRepository(
  listImpl: (options: { sessionId?: string; limit?: number }) => Promise<Execution[]>,
): ExecutionRepository {
  return {
    list: (options = {}) => listImpl(options),
    get: () => {
      throw new Error("unexpected get");
    },
  } as unknown as ExecutionRepository;
}

function fakeSessionRepository(sessions: Map<string, SessionMeta>): SessionRepository {
  return {
    get: (id) => sessions.get(id) ?? null,
  } as unknown as SessionRepository;
}

describe("GET /sessions/:id/messages", () => {
  test("reconstructs turns in chronological order with requirement and output", async () => {
    const e1 = execution({
      id: "exec-1",
      createdAt: "2026-10-07T10:00:00.000Z",
      requestPayload: { requirement: "第一轮：查询职业定位", mode: "query" },
      resultPayload: { output: "第一轮回答" },
    });
    const e2 = execution({
      id: "exec-2",
      createdAt: "2026-10-07T10:10:00.000Z",
      status: "failed",
      mode: "design",
      requestPayload: { requirement: "第二轮：设计战斗系统", mode: "design" },
      resultPayload: { output: "" },
      errorMessage: "LLM 调用超时",
    });
    const e3 = execution({
      id: "exec-3",
      createdAt: "2026-10-07T10:20:00.000Z",
      requestPayload: { requirement: "第三轮需求", mode: "query" },
      resultPayload: { output: "第三轮回答" },
    });
    // 存储层按 created_at DESC 返回（与 Postgres 实现一致）
    setExecutionRepositoryFactory(() =>
      fakeExecutionRepository(async () => [e3, e2, e1]),
    );
    setSessionRepositoryFactory(() =>
      fakeSessionRepository(new Map([["session-a", sessionA]])),
    );
    const app = tenantApp("user-a");
    app.route("/sessions", sessionsRoute);

    const res = await app.request("/sessions/session-a/messages");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; turns: Array<Record<string, unknown>> };
    expect(body.sessionId).toBe("session-a");
    expect(body.turns.map((t) => t.executionId)).toEqual(["exec-1", "exec-2", "exec-3"]);
    expect(body.turns[0]).toMatchObject({
      executionId: "exec-1",
      status: "completed",
      mode: "query",
      requirement: "第一轮：查询职业定位",
      output: "第一轮回答",
      error: null,
    });
    // 失败轮次：无产出但保留 status/error 供前端渲染失败提示
    expect(body.turns[1]).toMatchObject({
      status: "failed",
      mode: "design",
      output: "",
      error: "LLM 调用超时",
    });
  });

  test("drops executions without a string requirement", async () => {
    const bad = execution({
      id: "exec-bad",
      createdAt: "2026-10-07T10:00:00.000Z",
      requestPayload: { mode: "query" },
    });
    const good = execution({
      id: "exec-good",
      createdAt: "2026-10-07T10:05:00.000Z",
      requestPayload: { requirement: "正常需求", mode: "query" },
      resultPayload: { output: "回答" },
    });
    setExecutionRepositoryFactory(() =>
      fakeExecutionRepository(async () => [good, bad]),
    );
    setSessionRepositoryFactory(() =>
      fakeSessionRepository(new Map([["session-a", sessionA]])),
    );
    const app = tenantApp("user-a");
    app.route("/sessions", sessionsRoute);

    const res = await app.request("/sessions/session-a/messages");

    const body = (await res.json()) as { turns: Array<{ executionId: string }> };
    expect(body.turns.map((t) => t.executionId)).toEqual(["exec-good"]);
  });

  test("keeps another tenant's session history invisible", async () => {
    setExecutionRepositoryFactory((userId) =>
      userId === "user-a"
        ? fakeExecutionRepository(async () => [
            execution({
              id: "exec-1",
              createdAt: "2026-10-07T10:00:00.000Z",
              requestPayload: { requirement: "A 的需求", mode: "query" },
            }),
          ])
        : fakeExecutionRepository(async () => []),
    );
    setSessionRepositoryFactory((userId) =>
      fakeSessionRepository(
        new Map(userId === "user-a" ? [["session-a", sessionA]] : []),
      ),
    );
    const app = tenantApp("user-b");
    app.route("/sessions", sessionsRoute);

    const res = await app.request("/sessions/session-a/messages");

    expect(res.status).toBe(404);
  });

  test("rejects invalid session ids and unknown sessions", async () => {
    setExecutionRepositoryFactory(() => fakeExecutionRepository(async () => []));
    setSessionRepositoryFactory(() => fakeSessionRepository(new Map()));
    const app = tenantApp("user-a");
    app.route("/sessions", sessionsRoute);

    const [invalid, missing] = await Promise.all([
      app.request("/sessions/not%2Fvalid/messages"),
      app.request("/sessions/unknown-session/messages"),
    ]);

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});
