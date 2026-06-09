import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { BetterAuthAdapter } from "../../src/adapter/betterauth/BetterAuthAdapter.js";
import { createApp, setAuthAdapter, setTenantPort } from "../../src/server/app.js";
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
  async checkConcurrencyLimit() {
    return { allowed: true, current: 0 };
  },
  async incrementConcurrency() {
    return 1;
  },
  async decrementConcurrency() {
    return 0;
  },
  async healthCheck() {
    return true;
  },
};

describe("server application auth boundaries", () => {
  beforeAll(() => {
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
    await expect(response.json()).resolves.toEqual({ error: "SessionManager not initialized" });
  });

  test("keeps Better Auth endpoints public", async () => {
    const app = createApp();

    const response = await app.request("/api/auth/get-session");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ auth: "ok" });
  });
});
