import type { HITLCheckpoint } from "./HITLRepository.js";

export interface HITLFreshnessCheckResult {
  readonly fresh: boolean;
  /** Human-readable reason when stale (shown to operator). */
  readonly reason?: string;
}

/**
 * Optional pre-resume freshness check (orders cancelled, inventory changed, etc.).
 * Default implementation always returns fresh; compose-root can inject domain checks.
 */
export interface HITLFreshnessPort {
  check(checkpoint: HITLCheckpoint): Promise<HITLFreshnessCheckResult>;
}
