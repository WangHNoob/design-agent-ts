import type { Context, Next } from "hono";
import type { TenantContext, TenantIsolationPort } from "../../port/user/TenantIsolationPort.js";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import { auditLoginOnce } from "../security/auditHelpers.js";

/**
 * Hono middleware that resolves the tenant context from Better Auth session.
 *
 * Uses TenantIsolationPort.resolveTenantFromHeaders() which internally
 * delegates to Better Auth's session validation.
 *
 * Usage:
 *   app.use("/api/*", authMiddleware(tenantPort));
 *   // In route handlers:
 *   const ctx = c.get("tenant") as TenantContext;
 */
export function authMiddleware(
  tenantPort: TenantIsolationPort,
  contextStorage: ContextStoragePort<TenantContext>,
) {
  return async (c: Context, next: Next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      return next();
    }

    // Convert Hono headers to plain record for TenantIsolationPort
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const tenantCtx = await tenantPort.resolveTenantFromHeaders(headers);

    if (!tenantCtx) {
      c.set("tenant", null);
      return next();
    }

    c.set("tenant", tenantCtx);
    void auditLoginOnce(tenantCtx.userId, tenantCtx.sessionId, {
      role: tenantCtx.role,
      path: c.req.path,
    });
    return contextStorage.run(tenantCtx, () => next());
  };
}

/**
 * Guard middleware that requires authentication.
 * Returns 401 if no valid tenant context is found.
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      return next();
    }
    const tenant = c.get("tenant") as TenantContext | null;
    if (!tenant) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}

/**
 * Guard middleware that requires admin role.
 * Returns 403 if the user is not an admin.
 */
export function requireAdmin() {
  return async (c: Context, next: Next) => {
    const tenant = c.get("tenant") as TenantContext | null;
    if (!tenant) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (tenant.role !== "admin") {
      return c.json({ error: "Forbidden: admin access required" }, 403);
    }
    await next();
  };
}
