import { Hono } from "hono";
import type { DirectorAgent } from "../../core/agent/director/DirectorAgent.js";
import { AgentResponse as AR } from "../../port/agent/AgentResponse.js";

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

// Global director instance (initialized in main entry)
let directorInstance: DirectorAgent | null = null;

export function setDirector(director: DirectorAgent) {
  directorInstance = director;
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

  try {
    const response = await directorInstance.execute(body.requirement, sessionId, body.mode, role);
    return c.json<ExecuteResponse>({
      success: response.success,
      output: AR.getTextContent(response),
      error: response.errorMessage,
      sessionId,
    });
  } catch (err) {
    return c.json<ExecuteResponse>({
      success: false,
      output: null,
      error: err instanceof Error ? err.message : String(err),
      sessionId,
    }, 500);
  }
});
