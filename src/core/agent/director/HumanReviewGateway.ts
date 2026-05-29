export interface ReviewResult<T = unknown> {
  decision: "approved" | "rejected" | "modified";
  modifications?: T;
  feedback?: string;
}

export interface ReviewPointConfig {
  enabled: boolean;
  timeout: number;
  autoContinueOnTimeout: boolean;
}

export interface HumanReviewGateway {
  configure?(points: Record<string, ReviewPointConfig>): void;
  isEnabled(): boolean;
  isReviewPointEnabled(point: string): boolean;
  requestReview<T>(sessionId: string, reviewPoint: string, content: T): Promise<ReviewResult<T>>;
  getMaxRevisionRounds(): number;
}
