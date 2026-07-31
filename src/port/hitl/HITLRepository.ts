export type HITLStage = "plan" | "subagent" | "integrate";
export type HITLStatus =
  | "waiting_review"
  | "approved"
  | "rejected"
  | "modified"
  | "expired"
  | "escalated";
export type HITLContentType = "markdown" | "json";
export type HITLReviewAction = "approve" | "reject" | "modify";
export type HITLResumePayload = Readonly<Record<string, unknown>>;

export interface HITLCheckpoint {
  id: string;
  sessionId: string;
  stage: HITLStage;
  status: HITLStatus;
  content: string;
  contentType: HITLContentType;
  agentName?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewAction?: HITLReviewAction;
  reviewComment?: string;
  modifiedContent?: string;
  userId: string;
  executionId?: string;
  taskId?: string;
  idempotencyKey?: string;
  reviewPoint: string;
  resumeCursor?: string;
  resumePayload?: HITLResumePayload;
  reviewerId?: string;
  fallback: boolean;
  updatedAt: string;
  /** Set when SLA is breached and policy=escalate. */
  escalatedAt?: string;
}

export interface CreateHITLCheckpointInput {
  id: string;
  sessionId: string;
  executionId?: string;
  taskId?: string;
  idempotencyKey?: string;
  stage: HITLStage;
  content: string;
  contentType?: HITLContentType;
  agentName?: string;
  reviewPoint: string;
  resumeCursor?: string;
  resumePayload?: HITLResumePayload;
}

export interface HITLCheckpointPatch {
  content?: string;
  contentType?: HITLContentType;
  agentName?: string | null;
  resumeCursor?: string | null;
  resumePayload?: HITLResumePayload | null;
}

export interface HITLListOptions {
  sessionId?: string;
  executionId?: string;
  status?: HITLStatus;
  /** When true, include waiting_review + escalated (ops pending board). */
  pendingOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface HITLReviewInput {
  action: HITLReviewAction;
  comment?: string;
  modifiedContent?: string;
  reviewerId: string;
  fallback?: boolean;
  reviewedAt?: string;
}

export interface HITLCreateResult {
  checkpoint: HITLCheckpoint;
  created: boolean;
}

/**
 * Tenant-bound HITL persistence contract.
 *
 * Review / expire / escalate implementations must atomically move only a
 * pending row (waiting_review or escalated) — CAS against status.
 */
export interface HITLRepository {
  create(input: CreateHITLCheckpointInput): Promise<HITLCreateResult>;
  get(id: string): Promise<HITLCheckpoint | null>;
  list(options?: HITLListOptions): Promise<HITLCheckpoint[]>;
  update(id: string, patch: HITLCheckpointPatch): Promise<HITLCheckpoint | null>;
  /**
   * CAS: only succeeds when status is waiting_review or escalated.
   * Returns null on concurrent conflict (another resume already won).
   */
  review(id: string, input: HITLReviewInput): Promise<HITLCheckpoint | null>;
  /**
   * CAS: mark expired from waiting_review/escalated. Returns null if already claimed.
   */
  expire(id: string, input: { comment?: string; reviewerId: string; reviewedAt?: string }): Promise<HITLCheckpoint | null>;
  /**
   * CAS: waiting_review → escalated. Idempotent if already escalated.
   * Returns null if no longer pending.
   */
  escalate(id: string, input: { comment?: string; reviewedAt?: string }): Promise<HITLCheckpoint | null>;
  delete(id: string): Promise<boolean>;
}

/**
 * System-scoped HITL queries for the timeout sweeper (cross-tenant).
 */
export interface HITLTimeoutScanPort {
  /** Pending checkpoints whose created_at is older than cutoffIso. */
  listPendingOlderThan(cutoffIso: string, limit?: number): Promise<HITLCheckpoint[]>;
}
