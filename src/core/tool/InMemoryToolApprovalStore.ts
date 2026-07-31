import type { GrantToolApprovalInput, ToolApprovalKey, ToolApprovalPort } from "../../port/tool/ToolApprovalPort.js";

interface StoredApproval {
  readonly userId: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly argsHash?: string;
  readonly approvalId: string;
  readonly expiresAt?: string;
}

/**
 * In-process tool approval store. Grants are scoped by user/session/tool[/argsHash].
 */
export class InMemoryToolApprovalStore implements ToolApprovalPort {
  private readonly byApprovalId = new Map<string, StoredApproval>();

  isApproved(key: ToolApprovalKey): boolean {
    const now = Date.now();
    for (const stored of this.byApprovalId.values()) {
      if (stored.userId !== key.userId) continue;
      if (stored.sessionId !== key.sessionId) continue;
      if (stored.toolName !== key.toolName) continue;
      if (key.argsHash) {
        if (!stored.argsHash || stored.argsHash !== key.argsHash) continue;
      }
      if (key.approvalId && stored.approvalId !== key.approvalId) continue;
      if (stored.expiresAt && Date.parse(stored.expiresAt) <= now) continue;
      return true;
    }
    return false;
  }

  grant(input: GrantToolApprovalInput): void {
    this.byApprovalId.set(input.approvalId, {
      userId: input.userId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      argsHash: input.argsHash,
      approvalId: input.approvalId,
      expiresAt: input.expiresAt,
    });
  }

  revoke(userId: string, approvalId: string): boolean {
    const stored = this.byApprovalId.get(approvalId);
    if (!stored || stored.userId !== userId) return false;
    this.byApprovalId.delete(approvalId);
    return true;
  }
}
