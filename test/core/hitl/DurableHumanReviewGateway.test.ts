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
  async expire() {
    return null;
  }
  async escalate() {
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

  test("idempotent create with an approved checkpoint returns approved (resume anti-loop)", async () => {
    const contextStorage = new MemoryContextStorage();
    const repository = new MemoryHITLRepository();
    const gateway = new DurableHumanReviewGateway({
      repositoryFactory: () => repository,
      contextStorage,
      idGenerator: { randomUUID: () => "cp-3" },
    });
    gateway.configure({
      "hitl-2-agent-output": { enabled: true, timeout: 1000, autoContinueOnTimeout: true },
    });
    // 预置已批准的同 key checkpoint
    repository.checkpoints.set("cp-3", {
      id: "cp-3",
      sessionId: "session-1",
      stage: "subagent",
      status: "approved",
      content: "{}",
      contentType: "json",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "user-1",
      executionId: "exec-1",
      taskId: "T1",
      idempotencyKey: "exec-1:hitl-2-agent-output:after_task:T1",
      reviewPoint: "hitl-2-agent-output",
      resumeCursor: "after_task:T1",
      fallback: false,
    });

    const result = await contextStorage.run(
      { userId: "user-1", role: "user", sessionId: "session-1" },
      () => gateway.requestReview(
        "session-1",
        "hitl-2-agent-output",
        { taskId: "T1", output: "产出" },
        { executionId: "exec-1", taskId: "T1", resumeCursor: "after_task:T1" },
      ),
    );

    expect(result.decision).toBe("approved");
    expect(result.checkpointId).toBe("cp-3");
  });

  test("idempotent create with a modified checkpoint returns modifications", async () => {
    const contextStorage = new MemoryContextStorage();
    const repository = new MemoryHITLRepository();
    const gateway = new DurableHumanReviewGateway({
      repositoryFactory: () => repository,
      contextStorage,
      idGenerator: { randomUUID: () => "cp-4" },
    });
    gateway.configure({
      "hitl-3-final": { enabled: true, timeout: 1000, autoContinueOnTimeout: true },
    });
    repository.checkpoints.set("cp-4", {
      id: "cp-4",
      sessionId: "session-1",
      stage: "integrate",
      status: "modified",
      content: "{}",
      contentType: "json",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "user-1",
      executionId: "exec-1",
      idempotencyKey: "exec-1:hitl-3-final:after_integrate",
      reviewPoint: "hitl-3-final",
      resumeCursor: "after_integrate",
      modifiedContent: JSON.stringify({ summary: "修改后的终稿" }),
      fallback: false,
    });

    const result = await contextStorage.run(
      { userId: "user-1", role: "user", sessionId: "session-1" },
      () => gateway.requestReview(
        "session-1",
        "hitl-3-final",
        { summary: "初稿", conflictCount: 0 },
        { executionId: "exec-1", resumeCursor: "after_integrate" },
      ),
    );

    expect(result.decision).toBe("modified");
    expect((result.modifications as { summary: string }).summary).toBe("修改后的终稿");
  });

  test("idempotent create with a rejected checkpoint returns rejected", async () => {
    const contextStorage = new MemoryContextStorage();
    const repository = new MemoryHITLRepository();
    const gateway = new DurableHumanReviewGateway({
      repositoryFactory: () => repository,
      contextStorage,
      idGenerator: { randomUUID: () => "cp-5" },
    });
    gateway.configure({
      "hitl-3-final": { enabled: true, timeout: 1000, autoContinueOnTimeout: true },
    });
    repository.checkpoints.set("cp-5", {
      id: "cp-5",
      sessionId: "session-1",
      stage: "integrate",
      status: "rejected",
      content: "{}",
      contentType: "json",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: "user-1",
      executionId: "exec-1",
      idempotencyKey: "exec-1:hitl-3-final:after_integrate",
      reviewPoint: "hitl-3-final",
      resumeCursor: "after_integrate",
      reviewComment: "数值不合理",
      fallback: false,
    });

    const result = await contextStorage.run(
      { userId: "user-1", role: "user", sessionId: "session-1" },
      () => gateway.requestReview(
        "session-1",
        "hitl-3-final",
        { summary: "初稿", conflictCount: 0 },
        { executionId: "exec-1", resumeCursor: "after_integrate" },
      ),
    );

    expect(result.decision).toBe("rejected");
    expect(result.feedback).toBe("数值不合理");
  });
});

