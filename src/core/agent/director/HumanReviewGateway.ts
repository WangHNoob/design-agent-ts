export interface ReviewContext {
  executionId?: string;
  taskId?: string;
  resumeCursor?: string;
}

export interface ReviewResult<T = unknown> {
  decision: "approved" | "rejected" | "modified" | "pending";
  modifications?: T;
  feedback?: string;
  checkpointId?: string;
  /** 当 HITL 机制因上下文不可用而降级时标记为 true；生产 Durable HITL 禁止静默批准 */
  fallback?: boolean;
}

export interface ReviewPointConfig {
  enabled: boolean;
  timeout: number;
  autoContinueOnTimeout: boolean;
}

export interface HumanReviewGateway {
  configure?(points: Record<string, ReviewPointConfig>, maxRevisionRounds?: number): void;
  isEnabled(): boolean;
  isReviewPointEnabled(point: string): boolean;
  requestReview<T>(
    sessionId: string,
    reviewPoint: string,
    content: T,
    context?: ReviewContext,
  ): Promise<ReviewResult<T>>;
  getMaxRevisionRounds(): number;
}
