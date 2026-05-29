import { Hono } from "hono";
import type { HITLManager } from "../../core/hitl/HITLManager.js";

let hitlManagerInstance: HITLManager | null = null;

export function setHITLManager(hm: HITLManager) {
  hitlManagerInstance = hm;
}

export const hitlRoute = new Hono();

hitlRoute.get("/checkpoints", async (c) => {
  if (!hitlManagerInstance) {
    return c.json({ error: "HITLManager not initialized" }, 503);
  }
  const sessionId = c.req.query("sessionId");
  const checkpoints = sessionId
    ? await hitlManagerInstance.listBySession(sessionId)
    : await hitlManagerInstance.listWaiting();
  return c.json({ checkpoints });
});

hitlRoute.get("/checkpoints/:id", async (c) => {
  if (!hitlManagerInstance) {
    return c.json({ error: "HITLManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const checkpoint = await hitlManagerInstance.getCheckpoint(id);
  if (!checkpoint) return c.json({ error: "Checkpoint not found" }, 404);
  return c.json(checkpoint);
});

hitlRoute.post("/checkpoints/:id/review", async (c) => {
  if (!hitlManagerInstance) {
    return c.json({ error: "HITLManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const body = await c.req.json<{ action: "approve" | "reject" | "modify"; comment?: string; modifiedContent?: string }>();

  const checkpoint = await hitlManagerInstance.reviewCheckpoint(id, body.action, {
    comment: body.comment,
    modifiedContent: body.modifiedContent,
  });

  if (!checkpoint) {
    return c.json({ error: "Checkpoint not found or already reviewed" }, 400);
  }

  return c.json(checkpoint);
});
