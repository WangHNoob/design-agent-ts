import type { SubTask } from "../schema/TaskPlan.js";
import { resolveDomainDefaultTools } from "./domainToolDefaults.js";
import { PlanViolationError } from "./PlanViolationError.js";

export interface PlanHardGuardOptions {
  /** Config overrides for domain defaults. */
  domainToolDefaults?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Resolve effective allowedTools for a SubTask.
 * - explicit `allowedTools` (including `[]`) wins
 * - otherwise domain defaults (config override → core default)
 */
export function resolveAllowedTools(
  task: Pick<SubTask, "domain" | "allowedTools">,
  options?: PlanHardGuardOptions,
): readonly string[] {
  if (task.allowedTools !== undefined) {
    return task.allowedTools;
  }
  return resolveDomainDefaultTools(task.domain, options?.domainToolDefaults);
}

/**
 * Intersect agent descriptor tool names with the step whitelist.
 * Empty whitelist → empty intersection (no tools).
 */
export function filterToolNames(
  agentTools: readonly string[],
  allowedTools: readonly string[],
): string[] {
  if (allowedTools.length === 0) return [];
  const allowed = new Set(allowedTools);
  return agentTools.filter((name) => allowed.has(name));
}

/**
 * Fail loud when `toolName` is not on the resolved whitelist.
 */
export function assertToolAllowed(
  task: Pick<SubTask, "id" | "domain" | "allowedTools">,
  toolName: string,
  options?: PlanHardGuardOptions,
): void {
  const allowed = resolveAllowedTools(task, options);
  if (allowed.includes(toolName)) return;
  throw new PlanViolationError({
    taskId: task.id,
    toolName,
    code: "tool_denied",
    reason: allowed.length === 0
      ? "task whitelist is empty (no external tools allowed)"
      : `tool not in allowedTools=[${allowed.join(", ")}]`,
  });
}

/**
 * Reject jump-ahead / out-of-order execution: all dependencies must be completed successfully.
 * Call at the start of task execution (after failed-deps → skipped path).
 */
export function assertExecutable(
  task: Pick<SubTask, "id" | "dependencies">,
  completedSuccessIds: ReadonlySet<string>,
): void {
  const unmet = task.dependencies.filter((depId) => !completedSuccessIds.has(depId));
  if (unmet.length === 0) return;
  throw new PlanViolationError({
    taskId: task.id,
    code: "dependency_unmet",
    reason: `dependencies not satisfied (cannot skip ahead): ${unmet.join(", ")}`,
  });
}

export const PlanHardGuard = {
  resolveAllowedTools,
  filterToolNames,
  assertToolAllowed,
  assertExecutable,
} as const;
