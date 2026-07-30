import { Hono } from "hono";
import type { HITLRepository } from "../../port/hitl/HITLRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";

export type HITLRepositoryFactory = (userId: string) => HITLRepository;

let hitlRepositoryFactory: HITLRepositoryFactory | null = null;

export function setHITLRepositoryFactory(factory: HITLRepositoryFactory) {
  hitlRepositoryFactory = factory;
}

export const hitlRoute = new Hono();

hitlRoute.get("/checkpoints", async (c) => {
  const factory = hitlRepositoryFactory;
  if (!factory) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const repository = factory((c.get("tenant") as TenantContext).userId);
  const sessionId = c.req.query("sessionId");
  const checkpoints = await repository.list(
    sessionId ? { sessionId } : { status: "waiting_review" },
  );
  return c.json({ checkpoints });
});

hitlRoute.get("/checkpoints/:id", async (c) => {
  const factory = hitlRepositoryFactory;
  if (!factory) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const id = c.req.param("id");
  const checkpoint = await factory((c.get("tenant") as TenantContext).userId).get(id);
  if (!checkpoint) return c.json({ error: "Checkpoint not found" }, 404);
  return c.json(checkpoint);
});

hitlRoute.post("/checkpoints/:id/review", async (c) => {
  const factory = hitlRepositoryFactory;
  if (!factory) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const tenant = c.get("tenant") as TenantContext;
  const id = c.req.param("id");
  const body = await c.req.json<{ action: "approve" | "reject" | "modify"; comment?: string; modifiedContent?: string }>();
  const repository = factory(tenant.userId);
  const existing = await repository.get(id);
  if (!existing) {
    return c.json({ error: "Checkpoint not found" }, 404);
  }
  if (existing.status !== "waiting_review") {
    return c.json({ error: "Checkpoint already reviewed" }, 409);
  }

  const checkpoint = await repository.review(id, {
    action: body.action,
    comment: body.comment,
    modifiedContent: body.modifiedContent,
    reviewerId: tenant.userId,
  });

  if (!checkpoint) {
    return c.json({ error: "Checkpoint changed concurrently" }, 409);
  }

  return c.json(checkpoint);
});
