import { Hono } from "hono";
import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { AuditAction } from "../../port/audit/types.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";

let auditStore: AuditStorePort | null = null;

export function setAuditStore(store: AuditStorePort | null): void {
  auditStore = store;
}

const VALID_ACTIONS = new Set<AuditAction>([
  "auth.login",
  "auth.logout",
  "config.change",
  "hitl.decision",
  "tool.invoke",
  "tool.denied",
]);

export const auditRoute = new Hono();

auditRoute.get("/", async (c) => {
  if (!auditStore) {
    return c.json({ error: "Audit store not initialized" }, 503);
  }

  const tenant = c.get("tenant") as TenantContext;
  const actionRaw = c.req.query("action");
  const action = actionRaw && VALID_ACTIONS.has(actionRaw as AuditAction)
    ? (actionRaw as AuditAction)
    : undefined;
  const limit = c.req.query("limit");
  const offset = c.req.query("offset");

  const entries = await auditStore.listByUser(tenant.userId, {
    action,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  return c.json({ entries, count: entries.length });
});
