import type { RateLimitCode, RateLimitRemaining } from "./types.js";

export interface RateLimitCheckInput {
  readonly userId: string;
  readonly rpmDelta?: number;
  readonly tpmDelta?: number;
  /** When false, checks limits without consuming quota. Default true. */
  readonly consume?: boolean;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly code?: RateLimitCode;
  readonly retryAfterMs?: number;
  readonly remaining?: RateLimitRemaining;
}

export interface RateLimitPort {
  checkAndConsume(input: RateLimitCheckInput): Promise<RateLimitResult>;
  getRemaining(userId: string): Promise<RateLimitRemaining>;
}
