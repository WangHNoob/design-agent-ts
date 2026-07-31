/**
 * Thrown when step failures keep occurring and `planMaxReplans` is exhausted.
 */
export class PlanReplanExhaustedError extends Error {
  readonly replanCount: number;
  readonly maxReplans: number;
  readonly failedTaskId?: string;

  constructor(input: {
    replanCount: number;
    maxReplans: number;
    failedTaskId?: string;
  }) {
    super(
      `重规划次数耗尽（已重规划 ${input.replanCount}/${input.maxReplans} 次）`
        + (input.failedTaskId ? `；最近失败任务=${input.failedTaskId}` : ""),
    );
    this.name = "PlanReplanExhaustedError";
    this.replanCount = input.replanCount;
    this.maxReplans = input.maxReplans;
    this.failedTaskId = input.failedTaskId;
  }
}

export function isPlanReplanExhaustedError(err: unknown): err is PlanReplanExhaustedError {
  return err instanceof PlanReplanExhaustedError
    || (typeof err === "object"
      && err !== null
      && (err as { name?: string }).name === "PlanReplanExhaustedError");
}
