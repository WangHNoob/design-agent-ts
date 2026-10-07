/**
 * Distinguishes timeout aborts from user cancels.
 *
 * Both PlanPipeline's per-task timeout and ExecutionWorker's deadline poll abort
 * with an `Error` whose `name` is "TimeoutError" (TaskTimeoutError / deadline
 * timeout), while user cancels abort with a DOMException "AbortError". Before
 * this check existed, an internal timeout surfaced as "Task cancelled by user"
 * and a cancelled TaskResult masked the failure — the design lane could then
 * hang with no terminal state (zombie execution, see execution 0bad5599).
 */
export function isTaskTimeoutSignal(signal?: AbortSignal): boolean {
  const reason: unknown = signal?.reason;
  return reason instanceof Error && reason.name === "TimeoutError";
}

/** Human-readable message for a timeout abort reason. */
export function taskTimeoutMessage(signal?: AbortSignal): string {
  const reason: unknown = signal?.reason;
  return reason instanceof Error && reason.message
    ? reason.message
    : "Task timed out";
}
