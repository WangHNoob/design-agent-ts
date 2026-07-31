import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type {
  CreateHITLCheckpointInput,
  HITLRepository,
  HITLStage,
} from "../../port/hitl/HITLRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import type {
  HumanReviewGateway,
  ReviewContext,
  ReviewPointConfig,
  ReviewResult,
} from "../agent/director/HumanReviewGateway.js";

export type HITLRepositoryFactory = (userId: string) => HITLRepository;

const REVIEW_POINT_STAGE: Record<string, HITLStage> = {
  "hitl-1-task-plan": "plan",
  "hitl-2-agent-output": "subagent",
  "hitl-3-final": "integrate",
};

/**
 * Framework-agnostic HITL gateway that persists checkpoints and returns
 * an explicit `pending` decision. Never silently auto-approves.
 */
export class DurableHumanReviewGateway implements HumanReviewGateway {
  private reviewPoints = new Map<string, ReviewPointConfig>();
  private maxRevisionRounds = 3;

  constructor(
    private readonly deps: {
      repositoryFactory: HITLRepositoryFactory;
      contextStorage: ContextStoragePort<TenantContext>;
      idGenerator: IdGeneratorPort;
    },
  ) {}

  configure(points: Record<string, ReviewPointConfig>, maxRevisionRounds?: number): void {
    this.reviewPoints.clear();
    for (const [key, config] of Object.entries(points)) {
      this.reviewPoints.set(key, config);
    }
    if (maxRevisionRounds !== undefined) {
      this.maxRevisionRounds = maxRevisionRounds;
    }
  }

  isEnabled(): boolean {
    return [...this.reviewPoints.values()].some((point) => point.enabled);
  }

  isReviewPointEnabled(point: string): boolean {
    return this.reviewPoints.get(point)?.enabled ?? false;
  }

  getMaxRevisionRounds(): number {
    return this.maxRevisionRounds;
  }

  async requestReview<T>(
    sessionId: string,
    reviewPoint: string,
    content: T,
    context: ReviewContext = {},
  ): Promise<ReviewResult<T>> {
    if (!this.isReviewPointEnabled(reviewPoint)) {
      return { decision: "approved" };
    }

    const tenant = this.deps.contextStorage.getStore();
    if (!tenant) {
      throw new Error(
        `HITL review point "${reviewPoint}" requires an authenticated tenant context`,
      );
    }
    if (!context.executionId) {
      throw new Error(
        `HITL review point "${reviewPoint}" requires executionId for durable pause/resume`,
      );
    }

    const repository = this.deps.repositoryFactory(tenant.userId);
    const stage = REVIEW_POINT_STAGE[reviewPoint] ?? "plan";
    const idempotencyKey = [
      context.executionId,
      reviewPoint,
      context.resumeCursor ?? "default",
    ].join(":");

    const input: CreateHITLCheckpointInput = {
      id: this.deps.idGenerator.randomUUID(),
      sessionId,
      executionId: context.executionId,
      taskId: context.taskId,
      idempotencyKey,
      stage,
      content: serializeContent(content),
      contentType: "json",
      reviewPoint,
      resumeCursor: context.resumeCursor ?? `after_${stage}`,
      resumePayload: {
        reviewPoint,
        stage,
        ...(context.resumeCursor ? { resumeCursor: context.resumeCursor } : {}),
      },
    };

    const { checkpoint } = await repository.create(input);
    return {
      decision: "pending",
      checkpointId: checkpoint.id,
      feedback: `${reviewPoint} waiting for human review`,
    };
  }
}

function serializeContent(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}
