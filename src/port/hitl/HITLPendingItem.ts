import type { HITLCheckpoint, HITLStatus } from "./HITLRepository.js";

/** Enriched pending-board row for ops UI. */
export interface HITLPendingItem {
  readonly checkpoint: HITLCheckpoint;
  /** Milliseconds since createdAt. */
  readonly waitingMs: number;
  /** True when waitingMs >= configured HITL timeout. */
  readonly overdue: boolean;
  /** True when status is escalated (SLA breached, still awaiting human). */
  readonly escalated: boolean;
}

export function isPendingHITLStatus(status: HITLStatus): boolean {
  return status === "waiting_review" || status === "escalated";
}
