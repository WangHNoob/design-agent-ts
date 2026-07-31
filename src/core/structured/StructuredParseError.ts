/**
 * Thrown when LLM output fails JSON extraction or Zod schema validation.
 * `issues` carries concrete reasons for retry feedback.
 */
export class StructuredParseError extends Error {
  readonly issues: string[];
  readonly raw?: string;

  constructor(issues: string[], raw?: string) {
    const summary = issues.length > 0 ? issues.join("; ") : "structured parse failed";
    super(summary);
    this.name = "StructuredParseError";
    this.issues = issues;
    this.raw = raw;
  }
}

export type StructuredExhaustedMode = "throw" | "degrade" | "hitl";

/**
 * Thrown when generateStructured exhausts retries with onExhausted "throw" | "hitl".
 */
export class StructuredExhaustedError extends Error {
  readonly issues: string[];
  readonly mode: StructuredExhaustedMode;
  readonly lastRaw?: string;
  readonly attempts: number;

  constructor(opts: {
    issues: string[];
    mode: StructuredExhaustedMode;
    lastRaw?: string;
    attempts: number;
  }) {
    super(
      `structured output exhausted after ${opts.attempts} attempt(s): ${opts.issues.join("; ")}`,
    );
    this.name = "StructuredExhaustedError";
    this.issues = opts.issues;
    this.mode = opts.mode;
    this.lastRaw = opts.lastRaw;
    this.attempts = opts.attempts;
  }
}

export function isStructuredParseError(err: unknown): err is StructuredParseError {
  return err instanceof StructuredParseError;
}

export function isStructuredExhaustedError(err: unknown): err is StructuredExhaustedError {
  return err instanceof StructuredExhaustedError;
}
