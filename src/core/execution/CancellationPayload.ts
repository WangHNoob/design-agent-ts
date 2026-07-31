import type { TaskResult } from "../schema/TaskResult.js";

export interface CancelledTaskSummary {
  readonly id: string;
  readonly status: TaskResult["status"];
  readonly domain?: string;
}

export interface CancellationStreamPayload {
  readonly completedTasks: readonly CancelledTaskSummary[];
  readonly incompleteTasks: readonly CancelledTaskSummary[];
  readonly partialOutput?: string;
  readonly message?: string;
}

export function buildCancellationPayload(
  results: readonly TaskResult[],
  partialOutput?: string,
  message = "Execution cancelled",
): CancellationStreamPayload {
  const completedTasks = results
    .filter((result) => result.status === "success")
    .map((result) => ({
      id: result.taskId,
      status: result.status,
      domain: result.domain,
    }));
  const incompleteTasks = results
    .filter((result) => result.status !== "success")
    .map((result) => ({
      id: result.taskId,
      status: result.status,
      domain: result.domain,
    }));
  return {
    completedTasks,
    incompleteTasks,
    partialOutput,
    message,
  };
}

export function isCancellationScenario(
  results: readonly TaskResult[],
  signal?: AbortSignal,
): boolean {
  const hasCancelled = results.some((result) => result.status === "cancelled");
  const hasHardError = results.some((result) => result.status === "error");
  return Boolean(signal?.aborted) || (hasCancelled && !hasHardError);
}
