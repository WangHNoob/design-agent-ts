import { describe, expect, test } from "vitest";
import { PostgresHITLRepository } from "../../../src/adapter/postgres/PostgresHITLRepository.js";
import type {
  DatabasePort,
  QueryParams,
  QueryResult,
  TransactionOptions,
} from "../../../src/port/infra/DatabasePort.js";

interface QueryCall {
  sql: string;
  params?: QueryParams;
}

class FakeDatabase implements DatabasePort {
  readonly calls: QueryCall[] = [];
  readonly responses: QueryResult[] = [];

  async query(sql: string, params?: QueryParams): Promise<QueryResult> {
    this.calls.push({ sql, params });
    return this.responses.shift() ?? { rows: [], rowCount: 0 };
  }

  async transaction<T>(
    fn: (tx: DatabasePort) => Promise<T>,
    _options?: TransactionOptions,
  ): Promise<T> {
    return fn(this);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

const checkpointRow = {
  id: "checkpoint-1",
  user_id: "user-a",
  session_id: "session-a",
  execution_id: "execution-a",
  task_id: null,
  idempotency_key: "review-1",
  stage: "plan",
  status: "waiting_review",
  content: "# Plan",
  content_type: "markdown",
  agent_name: null,
  review_point: "hitl-1-task-plan",
  resume_cursor: "plan-ready",
  resume_payload: { node: "route" },
  reviewer_id: null,
  fallback: false,
  review_action: null,
  review_comment: null,
  modified_content: null,
  created_at: new Date("2026-07-30T02:00:00.000Z"),
  reviewed_at: null,
  updated_at: new Date("2026-07-30T02:00:00.000Z"),
};

describe("PostgresHITLRepository", () => {
  test("uses tenant-scoped parents and idempotency when creating", async () => {
    const db = new FakeDatabase();
    db.responses.push({ rows: [{ ...checkpointRow, created: false }], rowCount: 1 });
    const repository = new PostgresHITLRepository(db, "user-a");

    const result = await repository.create({
      id: "checkpoint-new",
      sessionId: "session-a",
      executionId: "execution-a",
      idempotencyKey: "review-1",
      stage: "plan",
      content: "# Plan",
      reviewPoint: "hitl-1-task-plan",
      resumeCursor: "plan-ready",
      resumePayload: { node: "route" },
    });

    expect(result.created).toBe(false);
    expect(result.checkpoint.id).toBe("checkpoint-1");
    expect(db.calls[0]?.sql).toContain("s.user_id = $2::varchar");
    expect(db.calls[0]?.sql).toContain("e.id = $4::varchar AND e.user_id = $2::varchar");
    expect(db.calls[0]?.sql).toContain("($4::varchar IS NULL OR t.execution_id = $4::varchar)");
    expect(db.calls[0]?.sql).toContain("ON CONFLICT (user_id, idempotency_key)");
    expect(db.calls[0]?.params).toMatchObject({
      2: "user-a",
      6: "review-1",
      13: JSON.stringify({ node: "route" }),
    });
  });

  test("keeps cross-tenant checkpoints invisible", async () => {
    const db = new FakeDatabase();
    const repository = new PostgresHITLRepository(db, "user-b");

    await expect(repository.get("checkpoint-1")).resolves.toBeNull();

    expect(db.calls[0]?.sql).toContain("id = $1 AND user_id = $2");
    expect(db.calls[0]?.params).toEqual({ 1: "checkpoint-1", 2: "user-b" });
  });

  test("lists only within the bound tenant and applies pagination", async () => {
    const db = new FakeDatabase();
    const repository = new PostgresHITLRepository(db, "user-a");

    await repository.list({ status: "waiting_review", limit: 10, offset: 20 });

    expect(db.calls[0]?.sql).toMatch(/WHERE user_id = \$1 AND status = \$2/);
    expect(db.calls[0]?.params).toEqual({
      1: "user-a",
      2: "waiting_review",
      3: 10,
      4: 20,
    });
  });

  test("reviews atomically only from waiting_review", async () => {
    const db = new FakeDatabase();
    db.responses.push({
      rows: [{
        ...checkpointRow,
        status: "approved",
        review_action: "approve",
        reviewer_id: "reviewer-a",
        fallback: true,
        reviewed_at: "2026-07-30T03:00:00.000Z",
        updated_at: "2026-07-30T03:00:00.000Z",
      }],
      rowCount: 1,
    });
    const repository = new PostgresHITLRepository(db, "user-a");

    const reviewed = await repository.review("checkpoint-1", {
      action: "approve",
      reviewerId: "reviewer-a",
      fallback: true,
      reviewedAt: "2026-07-30T03:00:00.000Z",
    });

    expect(reviewed?.status).toBe("approved");
    expect(reviewed?.fallback).toBe(true);
    expect(db.calls[0]?.sql).toContain(
      "WHERE id = $8 AND user_id = $9 AND status IN ('waiting_review', 'escalated')",
    );
    expect(db.calls[0]?.params).toMatchObject({
      1: "approved",
      5: "reviewer-a",
      6: true,
      8: "checkpoint-1",
      9: "user-a",
    });
  });

  test("returns null when a concurrent reviewer already changed the status", async () => {
    const db = new FakeDatabase();
    const repository = new PostgresHITLRepository(db, "user-a");

    await expect(
      repository.review("checkpoint-1", {
        action: "reject",
        reviewerId: "reviewer-b",
      }),
    ).resolves.toBeNull();
  });
});
