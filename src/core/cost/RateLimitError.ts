import type { RateLimitCode } from "../../port/cost/types.js";

/**
 * Thrown when a TPM quota check rejects or the rate-limit backend is unavailable.
 */
export class RateLimitError extends Error {
  readonly code: RateLimitCode;
  readonly retryAfterMs?: number;

  constructor(message: string, code: RateLimitCode, retryAfterMs?: number) {
    super(message);
    this.name = "RateLimitError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}
