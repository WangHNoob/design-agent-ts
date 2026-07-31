import { Hono } from "hono";
import { ExecutionService } from "../../core/execution/ExecutionService.js";
import type { TaskPlan } from "../../core/schema/TaskPlan.js";
import { buildPendingBoard } from "../../core/hitl/HITLOps.js";
import { assertHITLFreshness } from "../../core/hitl/HITLTimeoutSweeper.js";
import { AlwaysFreshHITLCheck } from "../../core/hitl/AlwaysFreshHITLCheck.js";
import type { HITLFreshnessPort } from "../../port/hitl/HITLFreshnessPort.js";
import type { ExecutionRepository } from "../../port/execution/ExecutionRepository.js";
import type { HITLRepository } from "../../port/hitl/HITLRepository.js";
import { isPendingHITLStatus } from "../../port/hitl/HITLPendingItem.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { MessageQueuePort } from "../../port/queue/MessageQueuePort.js";
import type { SessionRepository } from "../../port/session/SessionRepository.js";
import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { ToolApprovalPort } from "../../port/tool/ToolApprovalPort.js";
import { appendAudit } from "../security/auditHelpers.js";
import type {
  TenantContext,
  TenantIsolationPort,
} from "../../port/user/TenantIsolationPort.js";
import { EXECUTION_QUEUE } from "../worker/ExecutionWorker.js";

export type HITLRepositoryFactory = (userId: string) => HITLRepository;

export interface HITLRouteDependencies {
  repositoryFactory: HITLRepositoryFactory;
  executionRepositoryFactory: (userId: string) => ExecutionRepository;
  sessionRepositoryFactory: (userId: string) => SessionRepository;
  queue: MessageQueuePort;
  tenantPort: TenantIsolationPort;
  idGenerator: IdGeneratorPort;
  maxRetries: number;
  /** HITL timeout SLA used for overdue flags on the pending board. */
  timeoutMs: number;
  freshness?: HITLFreshnessPort;
  auditStore?: AuditStorePort | null;
  toolApprovalStore?: ToolApprovalPort;
}

let dependencies: HITLRouteDependencies | null = null;

/** Test/bootstrap helper: update or create route deps with a repository factory. */
export function setHITLRepositoryFactory(factory: HITLRepositoryFactory) {
  if (!dependencies) {
    dependencies = {
      repositoryFactory: factory,
      executionRepositoryFactory: () => {
        throw new Error("HITL execution repository not configured");
      },
      sessionRepositoryFactory: () => {
        throw new Error("HITL session repository not configured");
      },
      queue: {
        async publish() {
          throw new Error("HITL queue not configured");
        },
      } as unknown as MessageQueuePort,
      tenantPort: {
        scopeKey(_userId: string, resourceType: string, key?: string) {
          return key ? `${resourceType}:${key}` : resourceType;
        },
        async acquireLock() {
          return {
            key: "test-lock",
            holderId: "test",
            acquiredAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30_000).toISOString(),
          };
        },
        async releaseLock() {
          return true;
        },
      } as unknown as TenantIsolationPort,
      idGenerator: {
        randomUUID() {
          return crypto.randomUUID();
        },
      },
      maxRetries: 3,
      timeoutMs: 300_000,
      freshness: new AlwaysFreshHITLCheck(),
    };
    return;
  }
  dependencies = { ...dependencies, repositoryFactory: factory };
}

export function setHITLRouteDependencies(next: HITLRouteDependencies): void {
  dependencies = {
    freshness: new AlwaysFreshHITLCheck(),
    ...next,
  };
}

export const hitlRoute = new Hono();

/** Ops pending board: waiting_review + escalated with waitingMs / overdue. */
hitlRoute.get("/pending", async (c) => {
  if (!dependencies) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const repository = dependencies.repositoryFactory((c.get("tenant") as TenantContext).userId);
  const checkpoints = await repository.list({ pendingOnly: true, limit: 100 });
  const items = buildPendingBoard(checkpoints, dependencies.timeoutMs);
  return c.json({
    items,
    count: items.length,
    overdueCount: items.filter((i) => i.overdue).length,
  });
});

hitlRoute.get("/checkpoints", async (c) => {
  if (!dependencies) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const repository = dependencies.repositoryFactory((c.get("tenant") as TenantContext).userId);
  const sessionId = c.req.query("sessionId");
  const checkpoints = await repository.list(
    sessionId ? { sessionId, pendingOnly: true } : { pendingOnly: true },
  );
  const items = buildPendingBoard(checkpoints, dependencies.timeoutMs);
  return c.json({
    checkpoints: items.map((i) => ({
      ...i.checkpoint,
      waitingMs: i.waitingMs,
      overdue: i.overdue,
      escalated: i.escalated,
    })),
  });
});

hitlRoute.get("/checkpoints/:id", async (c) => {
  if (!dependencies) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const id = c.req.param("id");
  const checkpoint = await dependencies.repositoryFactory(
    (c.get("tenant") as TenantContext).userId,
  ).get(id);
  if (!checkpoint) return c.json({ error: "Checkpoint not found" }, 404);
  const [item] = buildPendingBoard([checkpoint], dependencies.timeoutMs);
  return c.json({
    ...checkpoint,
    waitingMs: item?.waitingMs ?? 0,
    overdue: item?.overdue ?? false,
    escalated: item?.escalated ?? checkpoint.status === "escalated",
  });
});

hitlRoute.post("/checkpoints/:id/review", async (c) => {
  if (!dependencies) {
    return c.json({ error: "HITLRepository not initialized" }, 503);
  }
  const tenant = c.get("tenant") as TenantContext;
  const id = c.req.param("id");
  const body = await c.req.json<{
    action: "approve" | "reject" | "modify";
    comment?: string;
    modifiedContent?: string;
  }>();

  if (!["approve", "reject", "modify"].includes(body.action)) {
    return c.json({ error: "Invalid review action" }, 400);
  }
  if (body.action === "modify" && !body.modifiedContent?.trim()) {
    return c.json({ error: "modifiedContent is required for modify" }, 400);
  }

  const lockKey = dependencies.tenantPort.scopeKey(tenant.userId, "hitl-review", id);
  const lock = await dependencies.tenantPort.acquireLock(lockKey, {
    ttlMs: 30_000,
    waitTimeoutMs: 0,
    retries: 0,
    retryDelayMs: 0,
  });
  if (!lock) {
    return c.json({ error: "Checkpoint is being reviewed" }, 409);
  }

  try {
    const repository = dependencies.repositoryFactory(tenant.userId);
    const existing = await repository.get(id);
    if (!existing) {
      return c.json({ error: "Checkpoint not found" }, 404);
    }
    if (!isPendingHITLStatus(existing.status)) {
      return c.json({ error: "Checkpoint already reviewed", code: "HITL_ALREADY_RESOLVED" }, 409);
    }

    const freshness = await assertHITLFreshness(
      existing,
      dependencies.freshness ?? new AlwaysFreshHITLCheck(),
    );
    if (!freshness.ok) {
      return c.json(
        { error: freshness.reason, code: "HITL_STALE" },
        409,
      );
    }

    // CAS: only one concurrent resume wins (status IN waiting_review|escalated).
    const checkpoint = await repository.review(id, {
      action: body.action,
      comment: body.comment,
      modifiedContent: body.modifiedContent,
      reviewerId: tenant.userId,
    });
    if (!checkpoint) {
      return c.json({ error: "Checkpoint changed concurrently", code: "HITL_CAS_CONFLICT" }, 409);
    }

    if (
      dependencies.toolApprovalStore
      && checkpoint.reviewPoint === "hitl-tool-irreversible"
      && (body.action === "approve" || body.action === "modify")
    ) {
      const payload = checkpoint.resumePayload ?? {};
      dependencies.toolApprovalStore.grant({
        userId: tenant.userId,
        sessionId: String(payload.sessionId ?? checkpoint.sessionId),
        toolName: String(payload.toolName ?? ""),
        argsHash: typeof payload.argsHash === "string" ? payload.argsHash : undefined,
        approvalId: checkpoint.id,
      });
    }

    await appendAudit({
      userId: tenant.userId,
      action: "hitl.decision",
      resourceType: "hitl_checkpoint",
      resourceId: checkpoint.id,
      sessionId: checkpoint.sessionId,
      executionId: checkpoint.executionId,
      outcome: body.action === "reject" ? "denied" : "success",
      detail: {
        reviewPoint: checkpoint.reviewPoint,
        reviewAction: body.action,
        fallback: checkpoint.fallback,
      },
    });

    if (!checkpoint.executionId) {
      return c.json({ checkpoint });
    }

    const executionRepository = dependencies.executionRepositoryFactory(tenant.userId);
    const sessionRepository = dependencies.sessionRepositoryFactory(tenant.userId);
    const service = new ExecutionService(executionRepository, dependencies.idGenerator);
    const execution = await executionRepository.get(checkpoint.executionId);
    if (!execution) {
      return c.json({ error: "Execution not found for checkpoint" }, 404);
    }

    if (body.action === "reject") {
      const failed = await service.fail(
        checkpoint.executionId,
        Object.assign(new Error(body.comment ?? "HITL rejected"), { errorClass: "permanent" }),
      );
      await sessionRepository.update(execution.sessionId, {
        status: "failed",
        error: failed.errorMessage ?? body.comment ?? "HITL rejected",
        hitlCheckpointId: checkpoint.id,
      });
      return c.json({ checkpoint, execution: failed });
    }

    if (body.action === "modify" && body.modifiedContent) {
      const modifiedPlan = parseModifiedPlan(body.modifiedContent, execution.planPayload);
      if (!modifiedPlan) {
        return c.json({ error: "modifiedContent must be a valid TaskPlan JSON" }, 400);
      }
      await executionRepository.update(checkpoint.executionId, {
        planPayload: { plan: modifiedPlan, reviewPoint: checkpoint.reviewPoint },
      });
    }

    const resumed = await service.resume(checkpoint.executionId, {
      checkpointId: checkpoint.id,
      reviewAction: body.action,
      reviewPoint: checkpoint.reviewPoint,
    });
    await sessionRepository.update(execution.sessionId, {
      status: "queued",
      error: "",
      hitlCheckpointId: checkpoint.id,
    });
    await dependencies.queue.publish(
      EXECUTION_QUEUE,
      { executionId: resumed.id, userId: tenant.userId },
      { userId: tenant.userId, maxRetries: dependencies.maxRetries },
    );

    return c.json({ checkpoint, execution: resumed });
  } finally {
    await dependencies.tenantPort.releaseLock(lock);
  }
});

function parseModifiedPlan(
  modifiedContent: string,
  currentPlanPayload: Readonly<Record<string, unknown>> | undefined,
): TaskPlan | null {
  try {
    const parsed = JSON.parse(modifiedContent) as unknown;
    const candidate = (
      typeof parsed === "object"
      && parsed !== null
      && "plan" in parsed
    )
      ? (parsed as { plan: unknown }).plan
      : parsed;
    if (
      typeof candidate !== "object"
      || candidate === null
      || typeof Reflect.get(candidate, "planId") !== "string"
      || typeof Reflect.get(candidate, "requirement") !== "string"
      || !Array.isArray(Reflect.get(candidate, "subTasks"))
    ) {
      return null;
    }
    return candidate as TaskPlan;
  } catch {
    void currentPlanPayload;
    return null;
  }
}
