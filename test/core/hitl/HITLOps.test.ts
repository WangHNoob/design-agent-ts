import { describe, expect, test } from "vitest";
import {
  buildPendingBoard,
  resolveTimeoutDecision,
} from "../../../src/core/hitl/HITLOps.js";
import {
  applyHITLTimeout,
  assertHITLFreshness,
  sweepHITLTimeouts,
} from "../../../src/core/hitl/HITLTimeoutSweeper.js";
import type {
  CreateHITLCheckpointInput,
  HITLCheckpoint,
  HITLCreateResult,
  HITLListOptions,
  HITLRepository,
  HITLReviewInput,
  HITLTimeoutScanPort,
} from "../../../src/port/hitl/HITLRepository.js";
import type { HITLFreshnessPort } from "../../../src/port/hitl/HITLFreshnessPort.js";
import { isPendingHITLStatus } from "../../../src/port/hitl/HITLPendingItem.js";

class MemoryHITLRepository implements HITLRepository {
  checkpoints = new Map<string, HITLCheckpoint>();

  async create(input: CreateHITLCheckpointInput): Promise<HITLCreateResult> {
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

  async list(options: HITLListOptions = {}) {
    let all = [...this.checkpoints.values()];
    if (options.pendingOnly) {
      all = all.filter((c) => isPendingHITLStatus(c.status));
    } else if (options.status) {
      all = all.filter((c) => c.status === options.status);
    }
    return all;
  }

  async update() {
    return null;
  }

  async review(id: string, input: HITLReviewInput) {
    const cp = this.checkpoints.get(id);
    if (!cp || !isPendingHITLStatus(cp.status)) return null;
    const status =
      input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "modified";
    const next: HITLCheckpoint = {
      ...cp,
      status,
      reviewAction: input.action,
      reviewComment: input.comment,
      modifiedContent: input.modifiedContent,
      reviewerId: input.reviewerId,
      fallback: input.fallback ?? false,
      reviewedAt: input.reviewedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.checkpoints.set(id, next);
    return next;
  }

  async expire(id: string, input: { comment?: string; reviewerId: string; reviewedAt?: string }) {
    const cp = this.checkpoints.get(id);
    if (!cp || !isPendingHITLStatus(cp.status)) return null;
    const next: HITLCheckpoint = {
      ...cp,
      status: "expired",
      reviewComment: input.comment,
      reviewerId: input.reviewerId,
      fallback: true,
      reviewedAt: input.reviewedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.checkpoints.set(id, next);
    return next;
  }

  async escalate(id: string, input: { comment?: string; reviewedAt?: string }) {
    const cp = this.checkpoints.get(id);
    if (!cp) return null;
    if (cp.status === "escalated") return cp;
    if (cp.status !== "waiting_review") return null;
    const next: HITLCheckpoint = {
      ...cp,
      status: "escalated",
      escalatedAt: input.reviewedAt ?? new Date().toISOString(),
      reviewComment: input.comment ?? cp.reviewComment,
      updatedAt: new Date().toISOString(),
    };
    this.checkpoints.set(id, next);
    return next;
  }

  async delete() {
    return false;
  }
}

function seedWaiting(repo: MemoryHITLRepository, id: string, createdAt: string): HITLCheckpoint {
  const cp: HITLCheckpoint = {
    id,
    sessionId: "s1",
    stage: "plan",
    status: "waiting_review",
    content: "{}",
    contentType: "json",
    createdAt,
    updatedAt: createdAt,
    userId: "user-1",
    executionId: "exec-1",
    reviewPoint: "hitl-1-task-plan",
    fallback: false,
  };
  repo.checkpoints.set(id, cp);
  return cp;
}

describe("HITL ops board", () => {
  test("buildPendingBoard computes waitingMs and overdue", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const items = buildPendingBoard(
      [
        {
          id: "a",
          sessionId: "s",
          stage: "plan",
          status: "waiting_review",
          content: "x",
          contentType: "json",
          createdAt: "2026-07-31T11:59:00.000Z",
          updatedAt: "2026-07-31T11:59:00.000Z",
          userId: "u",
          reviewPoint: "hitl-1-task-plan",
          fallback: false,
        },
        {
          id: "b",
          sessionId: "s",
          stage: "plan",
          status: "escalated",
          content: "y",
          contentType: "json",
          createdAt: "2026-07-31T11:00:00.000Z",
          updatedAt: "2026-07-31T11:30:00.000Z",
          userId: "u",
          reviewPoint: "hitl-1-task-plan",
          fallback: false,
          escalatedAt: "2026-07-31T11:30:00.000Z",
        },
      ],
      5 * 60_000,
      now,
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.checkpoint.id).toBe("b");
    expect(items[0]!.overdue).toBe(true);
    expect(items[0]!.escalated).toBe(true);
    expect(items[1]!.waitingMs).toBe(60_000);
    expect(items[1]!.overdue).toBe(false);
  });
});

describe("HITL timeout policy", () => {
  test("resolveTimeoutDecision maps policies", () => {
    expect(resolveTimeoutDecision("auto_reject").action).toBe("reject");
    expect(resolveTimeoutDecision("auto_approve").fallback).toBe(true);
    expect(resolveTimeoutDecision("expire").kind).toBe("expire");
    expect(resolveTimeoutDecision("escalate").kind).toBe("escalate");
  });

  test("auto_reject applies via CAS and second call skips", async () => {
    const repo = new MemoryHITLRepository();
    seedWaiting(repo, "cp-1", new Date(Date.now() - 60_000).toISOString());
    const decisions: string[] = [];

    const first = await applyHITLTimeout(repo.checkpoints.get("cp-1")!, "auto_reject", {
      repositoryFactory: () => repo,
      onAutoDecision: async ({ action }) => {
        decisions.push(action);
      },
      onExpired: async () => {
        decisions.push("expired");
      },
    });
    const second = await applyHITLTimeout(repo.checkpoints.get("cp-1")!, "auto_reject", {
      repositoryFactory: () => repo,
      onAutoDecision: async ({ action }) => {
        decisions.push(action);
      },
      onExpired: async () => {
        decisions.push("expired");
      },
    });

    expect(first).toBe("applied");
    expect(second).toBe("skipped");
    expect(decisions).toEqual(["reject"]);
    expect(repo.checkpoints.get("cp-1")?.status).toBe("rejected");
    expect(repo.checkpoints.get("cp-1")?.fallback).toBe(true);
  });

  test("concurrent double-resume: only one review CAS wins", async () => {
    const repo = new MemoryHITLRepository();
    seedWaiting(repo, "cp-race", new Date().toISOString());

    const [a, b] = await Promise.all([
      repo.review("cp-race", { action: "approve", reviewerId: "r1" }),
      repo.review("cp-race", { action: "reject", reviewerId: "r2" }),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(repo.checkpoints.get("cp-race")?.status).toMatch(/approved|rejected/);
  });

  test("sweepHITLTimeouts applies expire policy", async () => {
    const repo = new MemoryHITLRepository();
    const old = seedWaiting(repo, "old", new Date(Date.now() - 120_000).toISOString());
    seedWaiting(repo, "fresh", new Date().toISOString());

    const scan: HITLTimeoutScanPort = {
      async listPendingOlderThan(cutoffIso) {
        const cutoff = Date.parse(cutoffIso);
        return [...repo.checkpoints.values()].filter(
          (c) => isPendingHITLStatus(c.status) && Date.parse(c.createdAt) <= cutoff,
        );
      },
    };

    const expiredIds: string[] = [];
    const stats = await sweepHITLTimeouts({
      scan,
      timeoutMs: 60_000,
      policy: "expire",
      applyDeps: {
        repositoryFactory: () => repo,
        onAutoDecision: async () => {},
        onExpired: async (cp) => {
          expiredIds.push(cp.id);
        },
      },
    });

    expect(stats.applied).toBe(1);
    expect(expiredIds).toEqual([old.id]);
    expect(repo.checkpoints.get("old")?.status).toBe("expired");
    expect(repo.checkpoints.get("fresh")?.status).toBe("waiting_review");
  });

  test("freshness check blocks stale resume", async () => {
    const stale: HITLFreshnessPort = {
      async check() {
        return { fresh: false, reason: "order cancelled" };
      },
    };
    const repo = new MemoryHITLRepository();
    const cp = seedWaiting(repo, "stale", new Date().toISOString());
    const result = await assertHITLFreshness(cp, stale);
    expect(result).toEqual({ ok: false, reason: "order cancelled" });
  });
});
