import { interrupt } from "@langchain/langgraph";
import type { HumanReviewGateway, ReviewResult, ReviewPointConfig } from "../../core/agent/director/HumanReviewGateway.js";

export class LangGraphHumanReviewGateway implements HumanReviewGateway {
  private reviewPoints = new Map<string, ReviewPointConfig>();
  private maxRevisionRounds = 3;
  private timeoutMs = 300_000; // 5 minutes default
  private autoContinueOnTimeout = true;

  configure(points: Record<string, ReviewPointConfig>, maxRevisionRounds?: number): void {
    for (const [key, config] of Object.entries(points)) {
      this.reviewPoints.set(key, config);
    }
    if (maxRevisionRounds !== undefined) {
      this.maxRevisionRounds = maxRevisionRounds;
    }
  }

  setTimeout(timeoutMs: number, autoContinue: boolean): void {
    this.timeoutMs = timeoutMs;
    this.autoContinueOnTimeout = autoContinue;
  }

  isEnabled(): boolean {
    return this.reviewPoints.size > 0;
  }

  isReviewPointEnabled(point: string): boolean {
    return this.reviewPoints.get(point)?.enabled ?? false;
  }

  async requestReview<T>(
    _sessionId: string,
    reviewPoint: string,
    content: T,
  ): Promise<ReviewResult<T>> {
    if (!this.isReviewPointEnabled(reviewPoint)) {
      return { decision: "approved" };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Never silently approve on timeout; keep an auditable fallback reject.
        console.warn(`[HITL] Review timeout for ${reviewPoint} — rejecting with fallback`);
        resolve({
          decision: "rejected",
          feedback: this.autoContinueOnTimeout
            ? "审阅超时（fallback reject，禁止静默通过）"
            : "审阅超时，未收到人工反馈",
          fallback: true,
        });
      }, this.timeoutMs);

      (async () => {
        try {
          const review = interrupt({
            question: `${reviewPoint} 需要人工审阅`,
            reviewPoint,
            content,
          });

          clearTimeout(timer);
          const reviewRecord = review as Record<string, unknown> | undefined;
          const decision = (reviewRecord?.decision as "approved" | "rejected" | "modified") ?? "approved";
          resolve({
            decision,
            modifications: reviewRecord?.modifications as T | undefined,
            feedback: reviewRecord?.feedback as string | undefined,
          });
        } catch (err) {
          clearTimeout(timer);
          // interrupt() only works inside a LangGraph graph node.
          // Production path uses DurableHumanReviewGateway; this adapter must not silent-approve.
          console.warn(
            `[HITL] interrupt() failed for ${reviewPoint} — not inside LangGraph graph. ` +
            `Rejecting with fallback flag. Error: ${err instanceof Error ? err.message : String(err)}`
          );
          resolve({
            decision: "rejected",
            feedback: "HITL interrupt unavailable outside LangGraph graph",
            fallback: true,
          });
        }
      })();
    });
  }

  getMaxRevisionRounds(): number {
    return this.maxRevisionRounds;
  }
}
