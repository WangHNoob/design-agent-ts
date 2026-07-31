import { PlanReplanExhaustedError } from "./PlanReplanExhaustedError.js";

/** Whether another replan round is allowed (`count` = already completed replans). */
export function canReplan(replanCount: number, maxReplans: number): boolean {
  if (maxReplans <= 0) return false;
  return replanCount < maxReplans;
}

/**
 * Assert we may start another replan. Throws {@link PlanReplanExhaustedError} when over budget.
 * @param replanCount number of replans already performed
 * @param maxReplans configured ceiling (0 = never)
 */
export function assertWithinReplanBudget(
  replanCount: number,
  maxReplans: number,
  failedTaskId?: string,
): void {
  if (canReplan(replanCount, maxReplans)) return;
  throw new PlanReplanExhaustedError({
    replanCount,
    maxReplans,
    failedTaskId,
  });
}
