import { Hono } from "hono";
import type { TraceStorePort } from "../../port/tracing/TraceStorePort.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";

let traceStore: TraceStorePort | null = null;

export function setTraceStore(store: TraceStorePort | null): void {
  traceStore = store;
}

export const tracesRoute = new Hono();

tracesRoute.get("/:traceId", async (c) => {
  if (!traceStore) {
    return c.json({ error: "Trace store not initialized" }, 503);
  }
  const traceId = c.req.param("traceId");
  if (!/^[a-zA-Z0-9_-]+$/.test(traceId)) {
    return c.json({ error: "Invalid traceId" }, 400);
  }
  const userId = (c.get("tenant") as TenantContext).userId;
  const detail = await traceStore.getTrace(userId, traceId);
  if (!detail) {
    return c.json({ error: "Trace not found" }, 404);
  }
  return c.json(detail);
});
