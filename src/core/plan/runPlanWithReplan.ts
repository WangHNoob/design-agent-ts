import type { TaskPlan, SubTask } from "../schema/TaskPlan.js";
import type { TaskResult } from "../schema/TaskResult.js";
import { PlanPipeline, type TaskExecutor, type PlanPipelineOptions } from "../pipeline/PlanPipeline.js";
import { canReplan, assertWithinReplanBudget } from "./ReplanBudget.js";
import { PlanReplanExhaustedError } from "./PlanReplanExhaustedError.js";
import { isPlanViolationError } from "./PlanViolationError.js";
import type { PlanReplanner, ReplanInput } from "./PlanReplanner.js";

export interface RunPlanWithReplanOptions {
  plan: TaskPlan;
  executor: TaskExecutor;
  pipelineOptions?: Omit<PlanPipelineOptions, "initialResults">;
  initialResults?: readonly TaskResult[];
  /** When false, run a single pipeline pass with no replan. */
  enabled: boolean;
  maxReplans: number;
  replanner: PlanReplanner;
  /** Optional audit callback (Trace spans). Must not throw. */
  onAudit?: (name: string, attributes: Record<string, unknown>) => void | Promise<void>;
  onReplan?: (info: {
    replanCount: number;
    failedTaskId: string;
    remaining: readonly SubTask[];
    plan: TaskPlan;
  }) => void | Promise<void>;
}

export interface RunPlanWithReplanResult {
  results: TaskResult[];
  replanCount: number;
  exhausted: boolean;
  finalPlan: TaskPlan;
  /** Set when replan itself failed (invalid JSON / plan violation). */
  replanFailed?: boolean;
  replanErrorMessage?: string;
}

function mergeResultMaps(
  previous: readonly TaskResult[],
  next: readonly TaskResult[],
): TaskResult[] {
  const map = new Map<string, TaskResult>();
  for (const r of previous) map.set(r.taskId, r);
  for (const r of next) map.set(r.taskId, r);
  return [...map.values()];
}

function firstErrorResult(results: readonly TaskResult[]): TaskResult | undefined {
  return results.find((r) => r.status === "error");
}

function isCancelled(results: readonly TaskResult[], signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return results.some((r) => r.status === "cancelled");
}

/**
 * Execute a plan via PlanPipeline; on step failure, optionally replan remaining steps
 * up to `maxReplans`. Successful tasks are never re-run (`initialResults`).
 */
export async function runPlanWithReplan(
  options: RunPlanWithReplanOptions,
): Promise<RunPlanWithReplanResult> {
  let currentPlan = options.plan;
  let accumulated: TaskResult[] = [...(options.initialResults ?? [])];
  let replanCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pipeline = new PlanPipeline(currentPlan, options.executor, {
      ...options.pipelineOptions,
      initialResults: accumulated.filter((r) =>
        r.status === "success" || r.status === "skipped" || r.status === "cancelled"
      ),
    });
    const roundResults = await pipeline.execute();
    accumulated = mergeResultMaps(accumulated, roundResults);

    if (isCancelled(accumulated, options.pipelineOptions?.signal)) {
      return {
        results: accumulated,
        replanCount,
        exhausted: false,
        finalPlan: currentPlan,
      };
    }

    const failed = firstErrorResult(accumulated);
    if (!failed) {
      return {
        results: accumulated,
        replanCount,
        exhausted: false,
        finalPlan: currentPlan,
      };
    }

    if (!options.enabled) {
      return {
        results: accumulated,
        replanCount,
        exhausted: false,
        finalPlan: currentPlan,
      };
    }

    if (!canReplan(replanCount, options.maxReplans)) {
      await options.onAudit?.("plan.replan_exhausted", {
        replanCount,
        maxReplans: options.maxReplans,
        failedTaskId: failed.taskId,
      });
      return {
        results: accumulated,
        replanCount,
        exhausted: true,
        finalPlan: currentPlan,
      };
    }

    try {
      assertWithinReplanBudget(replanCount, options.maxReplans, failed.taskId);
    } catch (err) {
      if (err instanceof PlanReplanExhaustedError) {
        await options.onAudit?.("plan.replan_exhausted", {
          replanCount: err.replanCount,
          maxReplans: err.maxReplans,
          failedTaskId: failed.taskId,
        });
        return {
          results: accumulated,
          replanCount,
          exhausted: true,
          finalPlan: currentPlan,
        };
      }
      throw err;
    }

    const completedSuccess = accumulated.filter((r) => r.status === "success");
    const replanInput: ReplanInput = {
      originalPlan: currentPlan,
      completedResults: completedSuccess,
      failedTask: failed,
    };

    let remaining: SubTask[];
    try {
      remaining = await options.replanner.replanRemaining(replanInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await options.onAudit?.("plan.replan_failed", {
        failedTaskId: failed.taskId,
        replanCount,
        reason: message,
        code: isPlanViolationError(err) ? err.code : "replan_error",
      });
      return {
        results: accumulated,
        replanCount,
        exhausted: true,
        finalPlan: currentPlan,
        replanFailed: true,
        replanErrorMessage: message,
      };
    }
    replanCount += 1;

    if (remaining.length === 0) {
      await options.onAudit?.("plan.replan", {
        replanCount,
        failedTaskId: failed.taskId,
        remainingCount: 0,
        empty: true,
      });
      return {
        results: accumulated,
        replanCount,
        exhausted: false,
        finalPlan: currentPlan,
      };
    }

    // Drop failed/skipped results for tasks we are replacing; keep successes.
    const successIds = new Set(completedSuccess.map((r) => r.taskId));
    accumulated = accumulated.filter((r) => successIds.has(r.taskId));

    const successTasks = currentPlan.subTasks.filter((t) => successIds.has(t.id));
    currentPlan = {
      planId: `${options.plan.planId}-replan-${replanCount}`,
      requirement: options.plan.requirement,
      skillId: options.plan.skillId,
      subTasks: [...successTasks, ...remaining],
    };

    await options.onAudit?.("plan.replan", {
      replanCount,
      failedTaskId: failed.taskId,
      remainingCount: remaining.length,
    });
    await options.onReplan?.({
      replanCount,
      failedTaskId: failed.taskId,
      remaining,
      plan: currentPlan,
    });
  }
}
