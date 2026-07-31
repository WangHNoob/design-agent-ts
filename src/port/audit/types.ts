export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "config.change"
  | "hitl.decision"
  | "tool.invoke"
  | "tool.denied"
  | "saga.compensate_failed";

export type AuditOutcome = "success" | "denied" | "error";

export interface AuditEntry {
  readonly id: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly sessionId?: string;
  readonly executionId?: string;
  readonly traceId?: string;
  readonly outcome: AuditOutcome;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly createdAt: string;
}

export interface AppendAuditInput {
  readonly userId: string;
  readonly action: AuditAction;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly sessionId?: string;
  readonly executionId?: string;
  readonly traceId?: string;
  readonly outcome: AuditOutcome;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface AuditListOptions {
  readonly action?: AuditAction;
  readonly limit?: number;
  readonly offset?: number;
}
