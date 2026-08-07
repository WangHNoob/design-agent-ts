import http from "k6/http";
import { BASE_URL, jsonHeaders } from "./config.js";

export function waitForExecutionTerminal(cookie, executionId, timeoutMs = 120000) {
  const url = `${BASE_URL}/api/console/executions/${executionId}/events?afterCursor=0-0`;
  const res = http.get(url, {
    headers: {
      ...jsonHeaders(cookie),
      Accept: "text/event-stream",
    },
    timeout: `${timeoutMs}ms`,
    tags: { name: "sse_events" },
  });

  const body = String(res.body || "");
  const terminal =
    body.includes("execution_terminal")
    || body.includes('"status":"completed"')
    || body.includes('"status":"failed"')
    || body.includes('"status":"cancelled"');

  return {
    ok: res.status === 200 && terminal,
    status: res.status,
    bodySnippet: body.slice(0, 500),
    completed: body.includes('"status":"completed"') || body.includes("completed"),
  };
}
