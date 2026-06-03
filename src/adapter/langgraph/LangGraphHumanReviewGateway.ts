import { interrupt } from "@langchain/langgraph";
import type { HumanReviewGateway, ReviewResult, ReviewPointConfig } from "../../core/agent/director/HumanReviewGateway.js";

export class LangGraphHumanReviewGateway implements HumanReviewGateway {
  private reviewPoints = new Map<string, ReviewPointConfig>();
  private maxRevisionRounds = 3;

  configure(points: Record<string, ReviewPointConfig>, maxRevisionRounds?: number): void {
    for (const [key, config] of Object.entries(points)) {
      this.reviewPoints.set(key, config);
    }
    if (maxRevisionRounds !== undefined) {
      this.maxRevisionRounds = maxRevisionRounds;
    }
  }

  isEnabled(): boolean {
    return this.reviewPoints.size > 0;
  }

  isReviewPointEnabled(point: string): boolean {
    return this.reviewPoints.get(point)?.enabled ?? false;
  }

  async requestReview<T>(sessionId: string, reviewPoint: string, content: T): Promise<ReviewResult<T>> {
    if (!this.isReviewPointEnabled(reviewPoint)) {
      return { decision: "approved" };
    }

    try {
      const review = interrupt({
        question: `${reviewPoint} 需要人工审阅`,
        reviewPoint,
        content,
      });

      const reviewRecord = review as Record<string, unknown> | undefined;
      const decision = (reviewRecord?.decision as "approved" | "rejected" | "modified") ?? "approved";
      return {
        decision,
        modifications: reviewRecord?.modifications as T | undefined,
        feedback: reviewRecord?.feedback as string | undefined,
      };
    } catch (err) {
      // interrupt() only works inside a LangGraph graph node.
      // Outside of LangGraph context, auto-approve with fallback flag so callers can audit.
      console.warn(
        `[HITL] interrupt() failed for ${reviewPoint} — not inside LangGraph graph. ` +
        `Auto-approving with fallback flag. Error: ${err instanceof Error ? err.message : String(err)}`
      );
      return { decision: "approved", fallback: true };
    }
  }

  getMaxRevisionRounds(): number {
    return this.maxRevisionRounds;
  }
}
