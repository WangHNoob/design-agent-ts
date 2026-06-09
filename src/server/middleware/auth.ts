import type { Context, Next } from "hono";
import type { TenantContext, TenantIsolationPort } from "../../port/user/TenantIsolationPort.js";
import type { UserPort } from "../../port/user/UserPort.js";

/**
 * Hono middleware that extracts and validates the Bearer token,
 * then injects the TenantContext into the request context.
 *
 * Usage:
 *   app.use("/api/*", authMiddleware(userPort, tenantPort));
 *   // In route handlers:
 *   const ctx = c.get("tenant") as TenantContext;
 */
export function authMiddleware(
  userPort: UserPort,
  tenantPort: TenantIsolationPort,
) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      c.set("tenant", null);
      return next();
    }

    const token = authHeader.slice(7);
    const tenantCtx = await tenantPort.resolveTenant(token);

    if (!tenantCtx) {
      c.set("tenant", null);
      return next();
    }

    c.set("tenant", tenantCtx);
    await next();
  };
}

/**
 * Guard middleware that requires authentication.
 * Returns 401 if no valid tenant context is found.
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
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
