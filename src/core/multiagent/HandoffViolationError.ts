/**
 * Handoff schema / size violation. Downstream agents must not receive oversized payloads.
 */
export class HandoffViolationError extends Error {
  readonly field?: string;
  readonly reason: string;

  constructor(input: { reason: string; field?: string }) {
    super(
      input.field
        ? `Handoff violation [${input.field}]: ${input.reason}`
        : `Handoff violation: ${input.reason}`,
    );
    this.name = "HandoffViolationError";
    this.reason = input.reason;
    this.field = input.field;
  }
}

export function isHandoffViolationError(err: unknown): err is HandoffViolationError {
  return err instanceof HandoffViolationError
    || (typeof err === "object"
      && err !== null
      && (err as { name?: string }).name === "HandoffViolationError");
}
