import { Hono } from "hono";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import type { UserContextManager } from "../../core/user/UserContextManager.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

// Extend Hono's context to include tenant
declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext | null;
  }
}

let userContextManager: UserContextManager | null = null;

export function setUserContextManager(ucm: UserContextManager) {
  userContextManager = ucm;
}

export const usersRoute = new Hono();

// ─── Better Auth Handler ─────────────────────────────────────────
// All auth endpoints (register, login, logout, session, etc.)
// are handled by Better Auth at /api/auth/*
// This route file only handles user-specific asset queries.

// ─── Authenticated Routes ─────────────────────────────────────────

/** GET /api/users/me — Get current user profile. */
usersRoute.get("/me", requireAuth(), async (c) => {
  if (!userContextManager) {
    return c.json({ error: "UserContextManager not initialized" }, 503);
  }

  const tenant = c.get("tenant") as TenantContext;
  const user = await userContextManager.getUser(tenant.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
});

/** GET /api/users/me/assets — List current user's assets. */
usersRoute.get("/me/assets", requireAuth(), async (c) => {
  if (!userContextManager) {
    return c.json({ error: "UserContextManager not initialized" }, 503);
  }

  const tenant = c.get("tenant") as TenantContext;
  const assetType = c.req.query("type") as import("../../port/user/UserPort.js").UserAssetType | undefined;
  const assets = await userContextManager.listAvailableAssets(tenant, assetType);

  return c.json({
    assets: assets.map((a) => ({
      id: a.id,
      type: a.assetType,
      key: a.assetKey,
      owner: a.owner,
      isMutable: a.isMutable,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  });
});

// ─── Admin Routes ─────────────────────────────────────────────────

/** GET /api/users — List all users (admin only). */
usersRoute.get("/", requireAdmin(), async (c) => {
  if (!userContextManager) {
    return c.json({ error: "UserContextManager not initialized" }, 503);
  }
  return c.json({ message: "Admin user listing — to be implemented with UserPort.listUsers()" });
});
