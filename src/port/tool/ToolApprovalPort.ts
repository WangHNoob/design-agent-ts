export interface ToolApprovalKey {
  readonly userId: string;
  readonly sessionId: string;
  readonly toolName: string;
  /** Stable hash of tool arguments (optional — when set, approval is args-scoped). */
  readonly argsHash?: string;
  /** Explicit approval id from HITL checkpoint or manual grant. */
  readonly approvalId?: string;
}

export interface GrantToolApprovalInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly argsHash?: string;
  readonly approvalId: string;
  readonly expiresAt?: string;
}

export interface ToolApprovalPort {
  isApproved(key: ToolApprovalKey): boolean;
  grant(input: GrantToolApprovalInput): void;
  revoke(userId: string, approvalId: string): boolean;
}
