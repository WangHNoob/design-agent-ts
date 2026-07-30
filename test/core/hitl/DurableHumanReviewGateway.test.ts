import { describe, expect, test } from "vitest";
import { DurableHumanReviewGateway } from "../../../src/core/hitl/DurableHumanReviewGateway.js";
import type { ContextStoragePort } from "../../../src/port/infra/ContextStoragePort.js";
import type {
  CreateHITLCheckpointInput,
  HITLCheckpoint,
  HITLCreateResult,
  HITLRepository,
  HITLReviewInput,
} from "../../../src/port/hitl/HITLRepository.js";
import type { TenantContext } from "../../../src/port/user/TenantIsolationPort.js";

class MemoryContextStorage implements ContextStoragePort<TenantContext> {
  private store: TenantContext | undefined;
  run<R>(store: TenantContext, callback: () => R): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previous;
    }
  }
  getStore(): TenantContext | undefined {
    return this.store;
  }
}

class MemoryHITLRepository implements HITLRepository {
  checkpoints = new Map<string, HITLCheckpoint>();
  async create(input: CreateHITLCheckpointInput): Promise<HITLCreateResult> {
    const existing = [...this.checkpoints.values()].find(
      (item) => item.idempotencyKey === input.idempotencyKey,
    );
    if (existing) return { checkpoint: existing, created: false };
    const now = new Date().toISOString();
    const checkpoint: HITLCheckpoint = {
      id: input.id,
      sessionId: input.sessionId,
      stage: input.stage,
      status: "waiting_review",
      content: input.content,
      contentType: input.contentType ?? "json",
      createdAt: now,
      updatedAt: now,
      userId: "user-1",
      executionId: input.executionId,
      taskId: input.taskId,
      idempotencyKey: input.idempotencyKey,
      reviewPoint: input.reviewPoint,
      resumeCursor: input.resumeCursor,
      resumePayload: input.resumePayload,
      fallback: false,
    };
    this.checkpoints.set(checkpoint.id, checkpoint);
    return { checkpoint, created: true };
  }
  async get(id: string) {
    return this.checkpoints.get(id) ?? null;
  }
  async list() {
    return [...this.checkpoints.values()];
  }
  async update() {
    return null;
  }
  async review(_id: string, _input: HITLReviewInput) {
    return null;
  }
  async delete() {
    return false;
  }
}

describe("DurableHumanReviewGateway", () => {
  test("returns pending and never silently auto-approves when enabled", async () => {
    const contextStorage = new MemoryContextStorage();
    const repository = new MemoryHITLRepository();
    const gateway = new DurableHumanReviewGateway({
      repositoryFactory: () => repository,
      contextStorage,
      idGenerator: { randomUUID: () => "cp-1" },
    });
    gateway.configure({
      "hitl-1-task-plan": { enabled: true, timeout: 1000, autoContinueOnTimeout: true },
    });

    const result = await contextStorage.run(
      { userId: "user-1", role: "user", sessionId: "session-1" },
      () => gateway.requestReview(
        "session-1",
        "hitl-1-task-plan",
        { planId: "p1", requirement: "req", subTasks: [] },
        { executionId: "exec-1", resumeCursor: "after_plan" },
      ),
    );

    expect(result.decision).toBe("pending");
    expect(result.checkpointId).toBe("cp-1");
    expect(result.fallback).toBeUndefined();
    expect(repository.checkpoints.get("cp-1")?.status).toBe("waiting_review");
  });

  test("requires tenant context and executionId", async () => {
    const gateway = new DurableHumanReviewGateway({
      repositoryFactory: () => new MemoryHITLRepository(),
      contextStorage: new MemoryContextStorage(),
      idGenerator: { randomUUID: () => "cp-2" },
    });
    gateway.configure({
      "hitl-1-task-plan": { enabled: true, timeout: 1000, autoContinueOnTimeout: false },
    });

    await expect(gateway.requestReview("session-1", "hitl-1-task-plan", {}))
      .rejects.toThrow(/authenticated tenant context/);
  });
});
