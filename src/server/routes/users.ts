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

// ─── Public Routes ────────────────────────────────────────────────

/** POST /api/users/register — Register a new user. */
usersRoute.post("/register", async (c) => {
  if (!userContextManager) {
    return c.json({ error: "UserContextManager not initialized" }, 503);
  }

  const body = await c.req.json<{ email: string; displayName: string; password: string }>();
  if (!body.email || !body.displayName || !body.password) {
    return c.json({ error: "email, displayName, and password are required" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  try {
    const user = await userContextManager.createUser({
      email: body.email,
      displayName: body.displayName,
      password: body.password,
    });
    return c.json({ success: true, user: { id: user.id, email: user.email, displayName: user.displayName } }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return c.json({ error: "Email already registered" }, 409);
    }
    return c.json({ error: msg }, 500);
  }
});

/** POST /api/users/login — Authenticate and get a token. */
usersRoute.post("/login", async (c) => {
  if (!userContextManager) {
    return c.json({ error: "UserContextManager not initialized" }, 503);
  }

  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const result = await userContextManager.authenticate(body.email, body.password);
  if (!result) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  return c.json({
    success: true,
    token: result.token,
    expiresAt: result.expiresAt,
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
    },
  });
});

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
  // Admin user listing would need a listUsers method on UserPort
  // For now, return a placeholder
  return c.json({ message: "Admin user listing — to be implemented with UserPort.listUsers()" });
});
