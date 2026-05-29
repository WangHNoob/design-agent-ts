import { Hono } from "hono";
import type { SessionManager } from "../../core/session/SessionManager.js";

let sessionManagerInstance: SessionManager | null = null;

export function setSessionManager(sm: SessionManager) {
  sessionManagerInstance = sm;
}

export const sessionsRoute = new Hono();

sessionsRoute.get("/", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  const sessions = await sessionManagerInstance.list(limit, offset);
  return c.json({ sessions, total: sessions.length });
});

sessionsRoute.get("/:id", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const session = await sessionManagerInstance.get(id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

sessionsRoute.delete("/:id", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const deleted = await sessionManagerInstance.delete(id);
  if (!deleted) return c.json({ error: "Session not found" }, 404);
  return c.json({ success: true });
});
