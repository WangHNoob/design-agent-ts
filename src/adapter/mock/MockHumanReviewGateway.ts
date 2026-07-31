import type { HumanReviewGateway, ReviewResult } from "../../core/agent/director/HumanReviewGateway.js";

export class MockHumanReviewGateway implements HumanReviewGateway {
  private autoApprove = true;

  constructor(autoApprove = true) {
    this.autoApprove = autoApprove;
  }

  isEnabled(): boolean {
    return true;
  }

  isReviewPointEnabled(_point: string): boolean {
    return true;
  }

  async requestReview<T>(
    _sessionId: string,
    _reviewPoint: string,
    content: T,
  ): Promise<ReviewResult<T>> {
    if (this.autoApprove) {
      return { decision: "approved", modifications: content };
    }
    return { decision: "rejected", feedback: "Mock rejection" };
  }

  getMaxRevisionRounds(): number {
    return 3;
  }
}
