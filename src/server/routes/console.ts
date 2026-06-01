import { Hono } from "hono";
import type { DirectorAgent } from "../../core/agent/director/DirectorAgent.js";
import { AgentResponse as AR } from "../../port/agent/AgentResponse.js";
import type { SessionManager } from "../../core/session/SessionManager.js";
import type { HITLManager } from "../../core/hitl/HITLManager.js";

interface ExecuteRequest {
  requirement: string;
  sessionId?: string;
  mode: "design" | "query" | "table";
  role?: string;
}

interface ExecuteResponse {
  success: boolean;
  output: string | null;
  error: string | null;
  sessionId: string;
}

let directorInstance: DirectorAgent | null = null;
let sessionManagerInstance: SessionManager | null = null;
let hitlManagerInstance: HITLManager | null = null;

export function setDirector(director: DirectorAgent) {
  directorInstance = director;
}

export function setConsoleSessionManager(sm: SessionManager) {
  sessionManagerInstance = sm;
}

export function setConsoleHITLManager(hm: HITLManager) {
  hitlManagerInstance = hm;
}

export const consoleRoute = new Hono();

consoleRoute.post("/execute", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const sessionId = body.sessionId ?? crypto.randomUUID();
  const role = body.role ?? "chief_designer";

  if (!directorInstance) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: "DirectorAgent not initialized",
      sessionId,
    }, 503);
  }

  // track session
  await sessionManagerInstance?.create({
    id: sessionId,
    requirement: body.requirement,
    mode: body.mode,
    role,
    status: "running",
  });

  try {
    const response = await directorInstance.execute(body.requirement, sessionId, body.mode, role);
    const output = AR.getTextContent(response);

    await sessionManagerInstance?.update(sessionId, {
      status: response.success ? "completed" : "failed",
      output: output ?? undefined,
      error: response.errorMessage ?? undefined,
    });

    return c.json<ExecuteResponse>({
      success: response.success,
      output,
      error: response.errorMessage,
      sessionId,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await sessionManagerInstance?.update(sessionId, {
      status: "failed",
      error: errorMsg,
    });

    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: errorMsg,
      sessionId,
    }, 500);
  }
});

consoleRoute.post("/execute/stream", async (c) => {
  const body = await c.req.json<ExecuteRequest>();
  const sessionId = body.sessionId ?? crypto.randomUUID();
  const role = body.role ?? "chief_designer";

  if (!directorInstance) {
    return c.json({ error: "DirectorAgent not initialized" }, 503);
  }

  await sessionManagerInstance?.create({
    id: sessionId,
    requirement: body.requirement,
    mode: body.mode,
    role,
    status: "running",
  });

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
          role
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
          }
        }

        await sessionManagerInstance?.update(sessionId, {
          status: hasError ? "failed" : "completed",
          output: finalOutput || undefined,
          error: errorMsg || undefined,
        });

        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await sessionManagerInstance?.update(sessionId, { status: "failed", error: errorMsg });
        send("error", { error: errorMsg, sessionId });
        controller.close();
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
