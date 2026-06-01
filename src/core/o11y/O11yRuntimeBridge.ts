import type { RuntimeStatusReporter, RuntimeStatusCreate } from "../../port/o11y/RuntimeStatusReporter.js";

let reporter: RuntimeStatusReporter | null = null;

export function setRuntimeStatusReporter(r: RuntimeStatusReporter | null): void {
  reporter = r;
}

export function status(
  sessionId: string,
  traceId: string,
  currentPhase: RuntimeStatusCreate["current_phase"],
  progressPct: number,
  stepDescription: string,
  agentName?: string | null,
  tokenUsage?: RuntimeStatusCreate["token_usage"]
): void {
  if (!reporter) return;
  reporter
    .postRuntimeStatus({
      session_id: sessionId,
      trace_id: traceId,
      current_phase: currentPhase,
      progress_pct: progressPct,
      step_description: stepDescription,
      agent_name: agentName ?? null,
      token_usage: tokenUsage ?? null,
    })
    .catch(() => {});
}
