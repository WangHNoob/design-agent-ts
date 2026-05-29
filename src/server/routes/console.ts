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
        send("start", { sessionId, mode: body.mode, role });

        // simulate streaming by chunking the final result
        const response = await directorInstance!.execute(body.requirement, sessionId, body.mode, role);
        const output = AR.getTextContent(response) ?? "";

        // chunk output into ~30 char pieces for typing effect
        const chunkSize = 30;
        for (let i = 0; i < output.length; i += chunkSize) {
          const chunk = output.slice(i, i + chunkSize);
          send("chunk", { text: chunk, index: i });
          // small delay for typing effect feel
          await new Promise((r) => setTimeout(r, 15));
        }

        await sessionManagerInstance?.update(sessionId, {
          status: response.success ? "completed" : "failed",
          output: output ?? undefined,
          error: response.errorMessage ?? undefined,
        });

        send("complete", {
          success: response.success,
          output,
          error: response.errorMessage,
          sessionId,
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
