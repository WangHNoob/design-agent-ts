import type {
  Execution,
  ExecutionOutcome,
  ExecutionOutcomeSignal,
  ExecutionPayload,
} from "../../port/execution/types.js";

/**
 * Flywheel 01-P4 outcome-signal builders (pure, no infrastructure).
 *
 * `requirementHash` intentionally uses a fast non-cryptographic hash: it exists to
 * cluster near-duplicate requirements in the observability layer, not for security.
 */

/** Normalize a requirement for hashing: trim, collapse whitespace, lowercase. */
export function normalizeRequirement(requirement: string): string {
  return requirement.replace(/\s+/g, " ").trim().toLowerCase();
}

/** FNV-1a 32-bit hash rendered as 8 hex chars. */
export function hashRequirement(requirement: string): string {
  let hash = 0x811c9dc5;
  const normalized = normalizeRequirement(requirement);
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Hash from an execution request payload (missing/non-string requirement → hash of ""). */
export function requirementHashOf(payload: ExecutionPayload | undefined): string {
  const requirement = payload?.requirement;
  return hashRequirement(typeof requirement === "string" ? requirement : "");
}

/** Resolve the execution mode; defaults to "query" for malformed payloads. */
export function executionModeOf(payload: ExecutionPayload | undefined): "design" | "query" | "table" {
  const mode = payload?.mode;
  return mode === "design" || mode === "table" ? mode : "query";
}

/** Build a complete outcome signal for an execution row / event. */
export function buildOutcomeSignal(
  execution: Pick<Execution, "id" | "requestPayload">,
  outcome: ExecutionOutcome,
  extra: {
    attempts?: number;
    hitlCheckpoints?: readonly string[];
    failReason?: string;
  } = {},
): ExecutionOutcomeSignal {
  return {
    executionId: execution.id,
    mode: executionModeOf(execution.requestPayload),
    outcome,
    attempts: extra.attempts ?? 0,
    hitlCheckpoints: [...(extra.hitlCheckpoints ?? [])],
    requirementHash: requirementHashOf(execution.requestPayload),
    ...(extra.failReason ? { failReason: extra.failReason } : {}),
  };
}
