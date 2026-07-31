import { Hono } from "hono";
import type { DirectorAgent } from "../../core/agent/director/DirectorAgent.js";
import { ExecutionService } from "../../core/execution/ExecutionService.js";
import { ExecutionStateMachine } from "../../core/execution/ExecutionStateMachine.js";
import type { ExecutionEvent, ExecutionEventStore } from "../../port/execution/ExecutionEventStore.js";
import type { ExecutionRepository } from "../../port/execution/ExecutionRepository.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { MessageQueuePort } from "../../port/queue/MessageQueuePort.js";
import type { SessionMeta, SessionRepository } from "../../port/session/SessionRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import {
  EXECUTION_QUEUE,
  type ExecutionWorker,
} from "../worker/ExecutionWorker.js";
import type { RateLimitGuard } from "../../core/cost/RateLimitGuard.js";

interface ExecuteRequest {
  requirement: string;
  sessionId?: string;
  idempotencyKey?: string;
  mode: "design" | "query" | "table";
  role?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ConsoleExecutionDependencies {
  sessionRepositoryFactory: (userId: string) => SessionRepository;
  executionRepositoryFactory: (userId: string) => ExecutionRepository;
  queue: MessageQueuePort;
  eventStore: ExecutionEventStore;
  idGenerator: IdGeneratorPort;
  worker: ExecutionWorker;
  maxRetries: number;
}

let dependencies: ConsoleExecutionDependencies | null = null;
let directorConfigured = false;
let rateLimitGuard: RateLimitGuard | null = null;
let rateLimitEnabled = false;

export function setDirector(director: DirectorAgent): void {
  directorConfigured = true;
  dependencies?.worker?.setDirector(director);
}

export function setConsoleExecutionDependencies(next: ConsoleExecutionDependencies): void {
  dependencies = next;
}

export function setConsoleRateLimit(guard: RateLimitGuard | null, enabled: boolean): void {
  rateLimitGuard = guard;
  rateLimitEnabled = enabled;
}

export function hasActiveExecutions(): boolean {
  return dependencies?.worker.hasActiveExecutions() ?? false;
}

export const consoleRoute = new Hono();

function validateExecuteRequest(body: ExecuteRequest): string | null {
  if (!body.requirement || body.requirement.trim().length === 0) {
    return "Requirement cannot be empty";
  }
  if (body.requirement.trim().length > 50_000) {
    return "Requirement too long (max 50000 characters)";
  }
  if (!["design", "query", "table"].includes(body.mode)) {
    return "Mode must be design, query or table";
  }
  return null;
}

function queuedSession(
  id: string,
  body: ExecuteRequest,
  role: string,
): SessionMeta {
  const now = new Date().toISOString();
  return {
    id,
    requirement: body.requirement,
    mode: body.mode,
    role,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
}

async function assertRpmAllowed(userId: string) {
  if (!rateLimitEnabled || !rateLimitGuard) return null;
  const result = await rateLimitGuard.checkRpm(userId);
  if (result.allowed) return null;
  return {
    error: result.code ?? "RATE_LIMIT_RPM",
    code: result.code ?? "RATE_LIMIT_RPM",
    retryAfterMs: result.retryAfterMs,
  };
}

async function createExecution(
  body: ExecuteRequest,
  tenant: TenantContext,
  idempotencyHeader?: string,
) {
  if (!dependencies) throw new Error("not_initialized");
  const requestedSessionId = body.sessionId ?? crypto.randomUUID();
  const role = body.role ?? "chief_designer";
  const sessionRepository = dependencies.sessionRepositoryFactory(tenant.userId);
  if (!await sessionRepository.get(requestedSessionId)) {
    await sessionRepository.create(queuedSession(requestedSessionId, body, role));
  }

  const service = new ExecutionService(
    dependencies.executionRepositoryFactory(tenant.userId),
    dependencies.idGenerator,
  );
  const result = await service.create({
    sessionId: requestedSessionId,
    idempotencyKey: idempotencyHeader?.trim()
      || body.idempotencyKey?.trim()
      || requestedSessionId,
    requestPayload: {
      requirement: body.requirement,
      mode: body.mode,
      role,
      history: body.history ?? [],
    },
  });
  if (result.created) {
    await dependencies.queue.publish(
      EXECUTION_QUEUE,
      { executionId: result.entity.id, userId: tenant.userId },
      { userId: tenant.userId, maxRetries: dependencies.maxRetries },
    );
  }
  return {
    execution: result.entity,
    sessionId: result.entity.sessionId,
    created: result.created,
  };
}

consoleRoute.post("/execute", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const validationError = validateExecuteRequest(body);
  if (validationError) {
    return c.json({ error: "validation_error", message: validationError }, 400);
  }
  if (!directorConfigured || !dependencies?.worker.hasDirector()) {
    return c.json({ error: "not_configured", message: "Director is not configured" }, 409);
  }
  if (!dependencies) {
    return c.json({ error: "not_initialized" }, 503);
  }
  const tenant = c.get("tenant") as TenantContext;
  const rpmDenied = await assertRpmAllowed(tenant.userId);
  if (rpmDenied) {
    return c.json(rpmDenied, 429);
  }
  try {
    const result = await createExecution(
      body,
      tenant,
      c.req.header("Idempotency-Key"),
    );
    return c.json({
      executionId: result.execution.id,
      sessionId: result.sessionId,
      status: result.execution.status,
      created: result.created,
    }, 202);
  } catch (error) {
    return c.json({
      error: "execution_creation_failed",
      message: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

consoleRoute.post("/execute/stream", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const validationError = validateExecuteRequest(body);
  if (validationError) {
    return c.json({ error: "validation_error", message: validationError }, 400);
  }
  if (!directorConfigured || !dependencies?.worker.hasDirector()) {
    return c.json({ error: "not_configured", message: "Director is not configured" }, 409);
  }
  if (!dependencies) {
    return c.json({ error: "not_initialized" }, 503);
  }
  const tenant = c.get("tenant") as TenantContext;
  const rpmDenied = await assertRpmAllowed(tenant.userId);
  if (rpmDenied) {
    return c.json(rpmDenied, 429);
  }
  const created = await createExecution(body, tenant, c.req.header("Idempotency-Key"));
  const repository = dependencies.executionRepositoryFactory(tenant.userId);
  const eventStore = dependencies.eventStore;
  const afterCursor = c.req.header("Last-Event-ID")?.trim() || "0-0";
  const subscriptionController = new AbortController();
  const onDisconnect = () => subscriptionController.abort();
  c.req.raw.signal.addEventListener("abort", onDisconnect, { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = afterCursor;
      const send = (event: ExecutionEvent) => {
        controller.enqueue(encoder.encode(
          `id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
        ));
        cursor = event.cursor;
      };
      try {
        const replayed = await eventStore.replay(
          tenant.userId,
          created.execution.id,
          cursor,
          1_000,
        );
        for (const event of replayed) send(event);
        const latest = await repository.get(created.execution.id);
        if (
          replayed.some((event) => event.type === "execution_terminal")
          || (latest && ExecutionStateMachine.isTerminal(latest.status))
        ) {
          controller.close();
          return;
        }
        for await (const event of eventStore.subscribe(
          tenant.userId,
          created.execution.id,
          cursor,
          subscriptionController.signal,
        )) {
          send(event);
          if (event.type === "execution_terminal") break;
        }
        controller.close();
      } catch (error) {
        if (!subscriptionController.signal.aborted) {
          controller.enqueue(encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            })}\n\n`,
          ));
          controller.close();
        }
      } finally {
        c.req.raw.signal.removeEventListener("abort", onDisconnect);
      }
    },
    cancel() {
      subscriptionController.abort();
      c.req.raw.signal.removeEventListener("abort", onDisconnect);
    },
  });

  return new Response(stream, {
    status: 202,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Execution-Id": created.execution.id,
      "X-Session-Id": created.sessionId,
    },
  });
});

consoleRoute.get("/executions/:id", async (c) => {
  if (!dependencies) return c.json({ error: "not_initialized" }, 503);
  const tenant = c.get("tenant") as TenantContext;
  const execution = await dependencies.executionRepositoryFactory(tenant.userId)
    .get(c.req.param("id"));
  if (!execution) return c.json({ error: "not_found" }, 404);
  return c.json(execution);
});

consoleRoute.post("/cancel", async (c) => {
  if (!dependencies) return c.json({ success: false, error: "not_initialized" }, 503);
  const body = await c.req.json<{ executionId?: string; sessionId?: string }>();
  if (!body.executionId && !body.sessionId) {
    return c.json({ success: false, error: "executionId or sessionId is required" }, 400);
  }
  const tenant = c.get("tenant") as TenantContext;
  const repository = dependencies.executionRepositoryFactory(tenant.userId);
  let execution = body.executionId ? await repository.get(body.executionId) : null;
  if (!execution && body.sessionId) {
    execution = (await repository.list({ sessionId: body.sessionId, limit: 1 }))[0] ?? null;
  }
  if (!execution) return c.json({ success: false, error: "Execution not found" }, 404);
  if (ExecutionStateMachine.isTerminal(execution.status) && execution.status !== "cancelled") {
    return c.json({
      success: false,
      error: `Execution is already ${execution.status}`,
      executionId: execution.id,
      status: execution.status,
    }, 409);
  }
  const service = new ExecutionService(repository, dependencies.idGenerator);
  const cancelled = await service.cancel(execution.id);
  await dependencies.sessionRepositoryFactory(tenant.userId).update(
    cancelled.sessionId,
    { status: "cancelled", error: cancelled.errorMessage ?? "Execution cancelled" },
  );
  return c.json({
    success: true,
    executionId: cancelled.id,
    sessionId: cancelled.sessionId,
    status: cancelled.status,
  });
});
