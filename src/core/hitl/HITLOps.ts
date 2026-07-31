import type { HITLPendingItem } from "../../port/hitl/HITLPendingItem.js";
import { isPendingHITLStatus } from "../../port/hitl/HITLPendingItem.js";
import type { HITLCheckpoint } from "../../port/hitl/HITLRepository.js";
import type { HITLTimeoutPolicy } from "../../port/hitl/HITLTimeoutPolicy.js";

export function buildPendingBoard(
  checkpoints: readonly HITLCheckpoint[],
  timeoutMs: number,
  nowMs: number = Date.now(),
): HITLPendingItem[] {
  return checkpoints
    .filter((cp) => isPendingHITLStatus(cp.status))
    .map((checkpoint) => {
      const created = Date.parse(checkpoint.createdAt);
      const waitingMs = Number.isFinite(created) ? Math.max(0, nowMs - created) : 0;
      return {
        checkpoint,
        waitingMs,
        overdue: timeoutMs > 0 && waitingMs >= timeoutMs,
        escalated: checkpoint.status === "escalated",
      };
    })
    .sort((a, b) => b.waitingMs - a.waitingMs);
}

export interface TimeoutDecision {
  readonly kind: "review" | "expire" | "escalate";
  readonly action?: "approve" | "reject";
  readonly comment: string;
  readonly fallback: boolean;
}

/** Map configured timeout policy to a concrete durable action. */
export function resolveTimeoutDecision(policy: HITLTimeoutPolicy): TimeoutDecision {
  switch (policy) {
    case "auto_approve":
      return {
        kind: "review",
        action: "approve",
        comment: "HITL timeout: auto_approve (auditable fallback)",
        fallback: true,
      };
    case "auto_reject":
      return {
        kind: "review",
        action: "reject",
        comment: "HITL timeout: auto_reject (auditable fallback)",
        fallback: true,
      };
    case "expire":
      return {
        kind: "expire",
        comment: "HITL timeout: checkpoint expired",
        fallback: true,
      };
    case "escalate":
      return {
        kind: "escalate",
        comment: "HITL timeout: escalated for human follow-up",
        fallback: false,
      };
    default: {
      const _exhaustive: never = policy;
      return {
        kind: "review",
        action: "reject",
        comment: `HITL timeout: unknown policy ${String(_exhaustive)}`,
        fallback: true,
      };
    }
  }
}
