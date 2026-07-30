import { describe, expect, test } from "vitest";
import { PostgresExecutionRepository } from "../../../src/adapter/postgres/PostgresExecutionRepository.js";
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

const executionRow = {
  id: "execution-existing",
  user_id: "user-a",
  session_id: "session-a",
  idempotency_key: "request-1",
  status: "queued",
  request_payload: { requirement: "design" },
  plan_payload: null,
  result_payload: null,
  resume_cursor: null,
  resume_payload: null,
  error_class: null,
  error_message: null,
  deadline_at: null,
  started_at: null,
  completed_at: null,
  created_at: new Date("2026-07-30T01:00:00.000Z"),
  updated_at: new Date("2026-07-30T01:00:00.000Z"),
};

describe("PostgresExecutionRepository", () => {
  test("uses the tenant-scoped idempotency conflict path", async () => {
    const db = new FakeDatabase();
    db.responses.push({ rows: [{ ...executionRow, created: false }], rowCount: 1 });
    const repository = new PostgresExecutionRepository(db, "user-a");

    const result = await repository.create({
      id: "execution-new",
      sessionId: "session-a",
      idempotencyKey: "request-1",
      requestPayload: { requirement: "design" },
    });

    expect(result.created).toBe(false);
    expect(result.entity.id).toBe("execution-existing");
    expect(db.calls[0]?.sql).toContain("ON CONFLICT (user_id, idempotency_key)");
    expect(db.calls[0]?.params).toMatchObject({ 2: "user-a", 4: "request-1" });
  });

  test("does not expose an execution outside the bound tenant", async () => {
    const db = new FakeDatabase();
    const repository = new PostgresExecutionRepository(db, "user-b");

    await expect(repository.get("execution-existing")).resolves.toBeNull();

    expect(db.calls[0]?.sql).toContain("id = $1 AND user_id = $2");
    expect(db.calls[0]?.params).toEqual({ 1: "execution-existing", 2: "user-b" });
  });

  test("uses expected status and user_id for conditional transitions", async () => {
    const db = new FakeDatabase();
    db.responses.push({
      rows: [{ ...executionRow, status: "running", created: undefined }],
      rowCount: 1,
    });
    const repository = new PostgresExecutionRepository(db, "user-a");

    const transitioned = await repository.transitionStatus(
      "execution-existing",
      "queued",
      "running",
    );

    expect(transitioned?.status).toBe("running");
    expect(db.calls[0]?.sql).toMatch(/AND user_id = \$4\s+AND status = \$5/);
    expect(db.calls[0]?.params).toMatchObject({
      1: "running",
      3: "execution-existing",
      4: "user-a",
      5: "queued",
    });
  });

  test("scopes task creation to an execution owned by the tenant", async () => {
    const db = new FakeDatabase();
    db.responses.push({
      rows: [{
        id: "task-1",
        user_id: "user-a",
        execution_id: "execution-existing",
        task_key: "combat",
        name: "Combat",
        agent_name: null,
        status: "pending",
        dependencies: [],
        input_payload: {},
        output_payload: null,
        resume_cursor: null,
        resume_payload: null,
        position: 0,
        error_class: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: "2026-07-30T01:00:00.000Z",
        updated_at: "2026-07-30T01:00:00.000Z",
        created: true,
      }],
      rowCount: 1,
    });
    const repository = new PostgresExecutionRepository(db, "user-a");

    const result = await repository.createTask({
      id: "task-1",
      executionId: "execution-existing",
      taskKey: "combat",
      name: "Combat",
    });

    expect(result.created).toBe(true);
    expect(db.calls[0]?.sql).toContain("WHERE e.id = $3 AND e.user_id = $2");
    expect(db.calls[0]?.sql).toContain(
      "ON CONFLICT (user_id, execution_id, task_key)",
    );
    expect(db.calls[0]?.params).toMatchObject({ 2: "user-a", 3: "execution-existing" });
  });

  test("completes only a running attempt in the tenant scope", async () => {
    const db = new FakeDatabase();
    const repository = new PostgresExecutionRepository(db, "user-a");

    await expect(
      repository.completeAttempt("attempt-1", {
        status: "error",
        errorClass: "transient",
      }),
    ).resolves.toBeNull();

    expect(db.calls[0]?.sql).toContain(
      "WHERE id = $7 AND user_id = $8 AND status = 'running'",
    );
    expect(db.calls[0]?.params).toMatchObject({
      1: "error",
      2: "transient",
      7: "attempt-1",
      8: "user-a",
    });
  });
});
