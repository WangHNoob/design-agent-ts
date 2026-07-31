/**
 * Plan hard-guard violation: jump-ahead, unauthorized tool, or schema breach.
 * Fail loud and auditable — never silently skip.
 */
export class PlanViolationError extends Error {
  readonly taskId: string;
  readonly toolName?: string;
  readonly reason: string;
  readonly code: "tool_denied" | "dependency_unmet" | "invalid_plan";

  constructor(input: {
    taskId: string;
    reason: string;
    code?: PlanViolationError["code"];
    toolName?: string;
  }) {
    const prefix = input.toolName
      ? `Plan violation [task=${input.taskId} tool=${input.toolName}]`
      : `Plan violation [task=${input.taskId}]`;
    super(`${prefix}: ${input.reason}`);
    this.name = "PlanViolationError";
    this.taskId = input.taskId;
    this.toolName = input.toolName;
    this.reason = input.reason;
    this.code = input.code ?? "invalid_plan";
  }
}

export function isPlanViolationError(err: unknown): err is PlanViolationError {
  return err instanceof PlanViolationError
    || (typeof err === "object"
      && err !== null
      && (err as { name?: string }).name === "PlanViolationError");
}
