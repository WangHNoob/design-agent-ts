import { describe, expect, test } from "vitest";
import { PostgresSessionRepository } from "../../../src/adapter/postgres/PostgresSessionRepository.js";
import type {
  DatabasePort,
  QueryParams,
  QueryResult,
  TransactionOptions,
} from "../../../src/port/infra/DatabasePort.js";

class FakeDatabase implements DatabasePort {
  readonly calls: Array<{ sql: string; params?: QueryParams }> = [];
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

describe("PostgresSessionRepository", () => {
  test("paginates within the tenant and converts Date values to ISO strings", async () => {
    const db = new FakeDatabase();
    db.responses.push({
      rows: [{
        id: "session-a",
        requirement: "test",
        mode: "design",
        role: "designer",
        status: "running",
        created_at: new Date("2026-07-30T04:00:00.000Z"),
        updated_at: new Date("2026-07-30T05:00:00.000Z"),
        output: null,
        error: null,
        hitl_checkpoint_id: null,
      }],
      rowCount: 1,
    });
    const repository = new PostgresSessionRepository(db, "user-a");

    const sessions = await repository.list(25, 50);

    expect(sessions[0]?.createdAt).toBe("2026-07-30T04:00:00.000Z");
    expect(sessions[0]?.updatedAt).toBe("2026-07-30T05:00:00.000Z");
    expect(db.calls[0]?.sql).toContain(
      "WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3",
    );
    expect(db.calls[0]?.params).toEqual({ 1: "user-a", 2: 25, 3: 50 });
  });

  test("reports whether a tenant-scoped delete removed a row", async () => {
    const db = new FakeDatabase();
    db.responses.push({ rows: [], rowCount: 0 }, { rows: [], rowCount: 1 });
    const repository = new PostgresSessionRepository(db, "user-a");

    await expect(repository.delete("missing")).resolves.toBe(false);
    await expect(repository.delete("session-a")).resolves.toBe(true);

    expect(db.calls[0]?.params).toEqual({ 1: "missing", 2: "user-a" });
    expect(db.calls[1]?.params).toEqual({ 1: "session-a", 2: "user-a" });
  });
});
