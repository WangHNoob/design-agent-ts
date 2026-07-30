import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { Hono } from "hono";
import type { BetterAuthAdapter } from "../../src/adapter/betterauth/BetterAuthAdapter.js";
import { NodeContextStorageAdapter } from "../../src/adapter/infra/NodeContextStorageAdapter.js";
import { createApp, setAuthAdapter, setTenantContextStorage, setTenantPort } from "../../src/server/app.js";
import { authMiddleware } from "../../src/server/middleware/auth.js";
import type { TenantContext, TenantIsolationPort } from "../../src/port/user/TenantIsolationPort.js";

let currentTenant: TenantContext | null = null;

const tenantPort: TenantIsolationPort = {
  async resolveTenantFromHeaders() {
    return currentTenant;
  },
  scopeKey(userId, resourceType, key) {
    return [userId, resourceType, key].filter(Boolean).join(":");
  },
  async acquireLock() {
    return null;
  },
  async releaseLock() {
    return true;
  },
  async extendLock() {
    return null;
  },
  async cacheGet() {
    return null;
  },
  async cacheSet() {},
  async cacheDelete() {
    return true;
  },
  async cacheInvalidate() {
    return 0;
  },
  async acquireConcurrencySlot() {
    return { acquired: true, current: 1 };
  },
  async releaseConcurrencySlot() {
    return 0;
  },
  async healthCheck() {
    return true;
  },
};

describe("server application auth boundaries", () => {
  const contextStorage = new NodeContextStorageAdapter<TenantContext>();

  beforeAll(() => {
    setTenantContextStorage(contextStorage);
    setTenantPort(tenantPort);
    setAuthAdapter({
      auth: {
        handler: async () => Response.json({ auth: "ok" }),
      },
    } as unknown as BetterAuthAdapter);
  });

  beforeEach(() => {
    currentTenant = null;
  });

  test("rejects anonymous requests to business API routes", async () => {
    const app = createApp();

    const response = await app.request("/api/sessions");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  test("allows authenticated requests to reach business API routes", async () => {
    currentTenant = { userId: "user-1", role: "user", sessionId: "session-1" };
    const app = createApp();

    const response = await app.request("/api/sessions");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "SessionRepository not initialized" });
  });

  test("keeps Better Auth endpoints public", async () => {
    const app = createApp();

    const response = await app.request("/api/auth/get-session");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ auth: "ok" });
  });

  test("protects settings writes while allowing an admin to persist", async () => {
    const { setSettingsManager } = await import("../../src/server/routes/settings.js");
    setSettingsManager({
      getSettings: () => ({}),
      getPublicSettings: () => ({}),
      updateSettings: () => {},
      save: async () => {},
    } as never);
    const app = createApp();

    currentTenant = { userId: "user-1", role: "user", sessionId: "session-user" };
    const forbidden = await app.request("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    currentTenant = { userId: "admin-1", role: "admin", sessionId: "session-admin" };
    const allowed = await app.request("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(forbidden.status).toBe(403);
    expect(allowed.status).toBe(200);
    await expect(allowed.json()).resolves.toMatchObject({ success: true });
  });

  test("keeps parallel request contexts isolated across awaits", async () => {
    const parallelStorage = new NodeContextStorageAdapter<TenantContext>();
    const parallelTenantPort = {
      ...tenantPort,
      async resolveTenantFromHeaders(headers: Record<string, string | undefined>) {
        const userId = headers["x-user-id"];
        return userId
          ? { userId, role: "user" as const, sessionId: `session-${userId}` }
          : null;
      },
    };
    const app = new Hono();
    app.use("*", authMiddleware(parallelTenantPort, parallelStorage));
    app.get("/context", async (c) => {
      const before = parallelStorage.getStore()?.userId;
      await new Promise((resolve) => setTimeout(resolve, before === "user-a" ? 15 : 1));
      return c.json({ before, after: parallelStorage.getStore()?.userId });
    });

    const [a, b] = await Promise.all([
      app.request("/context", { headers: { "x-user-id": "user-a" } }),
      app.request("/context", { headers: { "x-user-id": "user-b" } }),
    ]);

    await expect(a.json()).resolves.toEqual({ before: "user-a", after: "user-a" });
    await expect(b.json()).resolves.toEqual({ before: "user-b", after: "user-b" });
    expect(parallelStorage.getStore()).toBeUndefined();
  });
});
