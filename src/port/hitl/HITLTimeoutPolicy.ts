/**
 * HITL timeout policy when a checkpoint waits past SLA.
 * - auto_reject: auditable reject with fallback=true (safe default)
 * - auto_approve: auditable approve with fallback=true (never silent)
 * - expire: mark expired and fail the execution (void)
 * - escalate: mark escalated, keep waiting for human (ops board highlight)
 */
export type HITLTimeoutPolicy = "auto_reject" | "auto_approve" | "expire" | "escalate";

export const HITL_TIMEOUT_POLICIES: readonly HITLTimeoutPolicy[] = [
  "auto_reject",
  "auto_approve",
  "expire",
  "escalate",
] as const;

export function isHITLTimeoutPolicy(value: string): value is HITLTimeoutPolicy {
  return (HITL_TIMEOUT_POLICIES as readonly string[]).includes(value);
}
