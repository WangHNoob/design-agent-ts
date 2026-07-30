export type HITLStage = "plan" | "subagent" | "integrate";
export type HITLStatus = "waiting_review" | "approved" | "rejected" | "modified";
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
 * Review implementations must atomically move only a waiting_review row.
 */
export interface HITLRepository {
  create(input: CreateHITLCheckpointInput): Promise<HITLCreateResult>;
  get(id: string): Promise<HITLCheckpoint | null>;
  list(options?: HITLListOptions): Promise<HITLCheckpoint[]>;
  update(id: string, patch: HITLCheckpointPatch): Promise<HITLCheckpoint | null>;
  review(id: string, input: HITLReviewInput): Promise<HITLCheckpoint | null>;
  delete(id: string): Promise<boolean>;
}
