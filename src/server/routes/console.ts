import { Hono } from "hono";
import type { DirectorAgent } from "../../core/agent/director/DirectorAgent.js";
import { AgentResponse as AR } from "../../port/agent/AgentResponse.js";
import type { SessionMeta, SessionRepository } from "../../port/session/SessionRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import type { UserContextManager } from "../../core/user/UserContextManager.js";

interface ExecuteRequest {
  requirement: string;
  sessionId?: string;
  mode: "design" | "query" | "table";
  role?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ExecuteResponse {
  success: boolean;
  output: string | null;
  error: string | null;
  sessionId: string;
}

let directorInstance: DirectorAgent | null = null;
let sessionRepositoryFactory: ((userId: string) => SessionRepository) | null = null;
let userContextManagerInstance: UserContextManager | null = null;
let maxConcurrentPerUser = 1;

export function setDirector(director: DirectorAgent) {
  directorInstance = director;
}

export function setConsoleExecutionDependencies(
  factory: (userId: string) => SessionRepository,
  userContextManager: UserContextManager,
  maxConcurrent: number,
) {
  sessionRepositoryFactory = factory;
  userContextManagerInstance = userContextManager;
  maxConcurrentPerUser = maxConcurrent;
}

export const consoleRoute = new Hono();

/** Active AbortControllers per session — used to cancel running executions. */
const activeControllers = new Map<string, AbortController>();

function executionKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

function runningSession(
  sessionId: string,
  body: ExecuteRequest,
  role: string,
): SessionMeta {
  const now = new Date().toISOString();
  return {
    id: sessionId,
    requirement: body.requirement,
    mode: body.mode,
    role,
    status: "running",
    createdAt: now,
    updatedAt: now,
  };
}

/** Check whether any execution is currently running. Used by settings to prevent mid-session config changes. */
export function hasActiveExecutions(): boolean {
  return activeControllers.size > 0;
}

function validateExecuteRequest(body: ExecuteRequest): string | null {
  if (!body.requirement || body.requirement.trim().length === 0) {
    return "Requirement cannot be empty";
  }
  if (body.requirement.trim().length > 50000) {
    return "Requirement too long (max 50000 characters)";
  }
  return null;
}

consoleRoute.post("/execute", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const sessionId = body.sessionId ?? crypto.randomUUID();
  const role = body.role ?? "chief_designer";
  const tenant = c.get("tenant") as TenantContext;

  const validationError = validateExecuteRequest(body);
  if (validationError) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: validationError,
      sessionId,
    }, 400);
  }

  if (!directorInstance) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "not_configured",
      sessionId,
    }, 409);
  }

  if (!sessionRepositoryFactory || !userContextManagerInstance) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "Tenant execution dependencies not initialized",
      sessionId,
    }, 503);
  }

  const repository = sessionRepositoryFactory(tenant.userId);
  const key = executionKey(tenant.userId, sessionId);

  // Concurrent execution guard
  if (activeControllers.has(key)) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "Session already has an active execution",
      sessionId,
    }, 409);
  }

  const slotAcquired = await userContextManagerInstance.acquireConcurrencySlot(
    tenant,
    maxConcurrentPerUser,
  );
  if (!slotAcquired) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "Tenant concurrent execution limit reached",
      sessionId,
    }, 429);
  }
  if (activeControllers.has(key)) {
    await userContextManagerInstance.releaseConcurrencySlot(tenant);
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "Session already has an active execution",
      sessionId,
    }, 409);
  }

  const abortController = new AbortController();
  activeControllers.set(key, abortController);

  try {
    await repository.create(runningSession(sessionId, body, role));
    const response = await directorInstance.execute(
      body.requirement, sessionId, body.mode, role, body.history,
      { signal: abortController.signal }
    );
    const output = AR.getTextContent(response);

    const isAborted = abortController.signal.aborted;
    await repository.update(sessionId, {
      status: isAborted ? "failed" : (response.success ? "completed" : "failed"),
      output: output ?? undefined,
      error: isAborted ? "Cancelled by user" : (response.errorMessage ?? undefined),
    });

    return c.json<ExecuteResponse>({
      success: isAborted ? false : response.success,
      output,
      error: isAborted ? "Cancelled by user" : response.errorMessage,
      sessionId,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    try {
      await repository.update(sessionId, { status: "failed", error: errorMsg });
    } catch {
      // Preserve the original execution error if persistence also fails.
    }

    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: errorMsg,
      sessionId,
    }, 500);
  } finally {
    activeControllers.delete(key);
    await userContextManagerInstance.releaseConcurrencySlot(tenant);
  }
});

consoleRoute.post("/execute/stream", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const sessionId = body.sessionId ?? crypto.randomUUID();
  const role = body.role ?? "chief_designer";
  const tenant = c.get("tenant") as TenantContext;

  const validationError = validateExecuteRequest(body);
  if (validationError) {
    return c.json({ error: "validation_error", message: validationError }, 400);
  }

  if (!directorInstance) {
    return c.json({ error: "not_configured", message: "API key not configured. Please configure via settings." }, 409);
  }

  if (!sessionRepositoryFactory || !userContextManagerInstance) {
    return c.json({ error: "not_initialized", message: "Tenant execution dependencies not initialized." }, 503);
  }

  const repository = sessionRepositoryFactory(tenant.userId);
  const key = executionKey(tenant.userId, sessionId);

  // Concurrent execution guard
  if (activeControllers.has(key)) {
    return c.json({ error: "concurrent_execution", message: "Session already has an active execution" }, 409);
  }

  const slotAcquired = await userContextManagerInstance.acquireConcurrencySlot(
    tenant,
    maxConcurrentPerUser,
  );
  if (!slotAcquired) {
    return c.json({ error: "concurrent_limit", message: "Tenant concurrent execution limit reached" }, 429);
  }
  if (activeControllers.has(key)) {
    await userContextManagerInstance.releaseConcurrencySlot(tenant);
    return c.json({ error: "concurrent_execution", message: "Session already has an active execution" }, 409);
  }

  const abortController = new AbortController();
  activeControllers.set(key, abortController);

  // Detect client disconnect: when the SSE client aborts the fetch,
  // propagate that into our AbortController so backend processing stops.
  const clientSignal = c.req.raw.signal;
  const onClientAbort = () => {
    console.log(`[console.ts] Client disconnected for session ${sessionId}, aborting execution`);
    abortController.abort();
  };
  clientSignal.addEventListener("abort", onClientAbort, { once: true });

  try {
    await repository.create(runningSession(sessionId, body, role));
  } catch (error) {
    clientSignal.removeEventListener("abort", onClientAbort);
    activeControllers.delete(key);
    await userContextManagerInstance.releaseConcurrencySlot(tenant);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "session_persistence_failed", message }, 500);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const eventStream = directorInstance!.executeStream(
          body.requirement,
          sessionId,
          body.mode,
          role,
          body.history,
          { signal: abortController.signal }
        );

        let finalOutput = "";
        let hasError = false;
        let errorMsg = "";

        for await (const event of eventStream) {
          switch (event.type) {
            case "start":
              send("start", event.data);
              break;
            case "plan":
              send("plan", event.data);
              break;
            case "route":
              send("route", event.data);
              break;
            case "task_start":
              send("task_start", event.data);
              break;
            case "task_complete":
              send("task_complete", event.data);
              break;
            case "integrate":
              send("integrate", event.data);
              break;
            case "chunk":
              send("chunk", event.data);
              finalOutput += (event.data.text as string) ?? "";
              break;
            case "complete":
              finalOutput = (event.data.output as string) ?? finalOutput;
              send("complete", { ...event.data, output: finalOutput, sessionId });
              break;
            case "error":
              hasError = true;
              errorMsg = (event.data.error as string) ?? "Unknown error";
              send("error", { ...event.data, sessionId });
              break;
            // Forward new event types
            case "thinking":
            case "tool_start":
            case "tool_complete":
            case "knowledge_used":
              send(event.type, event.data);
              break;
          }
        }

        const isAborted = abortController.signal.aborted;
        await repository.update(sessionId, {
          status: isAborted ? "failed" : (hasError ? "failed" : "completed"),
          output: finalOutput || undefined,
          error: isAborted ? "Cancelled by user" : (errorMsg || undefined),
        });
        controller.close();
      } catch (err) {
        const isAborted = abortController.signal.aborted;
        const errorMsg = err instanceof Error ? err.message : String(err);
        await repository.update(sessionId, {
          status: "failed",
          error: isAborted ? "Cancelled by user" : errorMsg,
        });
        if (!isAborted) {
          send("error", { error: errorMsg, sessionId });
        }
        controller.close();
      } finally {
        clientSignal.removeEventListener("abort", onClientAbort);
        activeControllers.delete(key);
        await userContextManagerInstance!.releaseConcurrencySlot(tenant);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

/** Cancel an active execution session. */
consoleRoute.post("/cancel", async (c) => {
  const body = await c.req.json<{ sessionId: string }>();
  const { sessionId } = body;
  const tenant = c.get("tenant") as TenantContext;

  if (!sessionId) {
    return c.json({ success: false, error: "sessionId is required" }, 400);
  }

  if (!sessionRepositoryFactory) {
    return c.json({ success: false, error: "SessionRepository not initialized" }, 503);
  }

  const repository = sessionRepositoryFactory(tenant.userId);
  const session = await repository.get(sessionId);
  if (!session) {
    return c.json({ success: false, error: "Session not found" }, 404);
  }

  const controller = activeControllers.get(executionKey(tenant.userId, sessionId));
  if (!controller) {
    return c.json({ success: false, error: "No active execution for this session" }, 404);
  }

  console.log(`[console.ts] Cancelling session ${sessionId}`);
  controller.abort();

  await repository.update(sessionId, {
    status: "failed",
    error: "Cancelled by user",
  });

  return c.json({ success: true, sessionId });
});
