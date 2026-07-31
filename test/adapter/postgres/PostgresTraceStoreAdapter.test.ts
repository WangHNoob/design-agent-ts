import { describe, expect, test } from "vitest";
import { PostgresTraceStoreAdapter } from "../../../src/adapter/postgres/PostgresTraceStoreAdapter.js";
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

describe("PostgresTraceStoreAdapter", () => {
  test("ensureSession upserts by user+session", async () => {
    const db = new FakeDatabase();
    db.responses.push({
      rows: [{
        id: "ts-1",
        user_id: "user-a",
        session_id: "sess-1",
        created_at: new Date("2026-07-31T00:00:00.000Z"),
      }],
      rowCount: 1,
    });
    const store = new PostgresTraceStoreAdapter(db);
    const session = await store.ensureSession({
      id: "ts-new",
      userId: "user-a",
      sessionId: "sess-1",
    });
    expect(session.id).toBe("ts-1");
    expect(db.calls[0]?.sql).toContain("ON CONFLICT (user_id, session_id)");
    expect(db.calls[0]?.params).toMatchObject({ 2: "user-a", 3: "sess-1" });
  });

  test("appendSpan is insert-only", async () => {
    const db = new FakeDatabase();
    db.responses.push({ rows: [], rowCount: 1 });
    const store = new PostgresTraceStoreAdapter(db);
    await store.appendSpan({
      id: "span-1",
      userId: "user-a",
      traceId: "trace-1",
      parentSpanId: "root",
      name: "QueryAgent.pre_reasoning",
      phase: "pre_reasoning",
      kind: "internal",
      status: "ok",
      attributes: { agentName: "QueryAgent" },
      startedAt: "2026-07-31T00:00:00.000Z",
      endedAt: "2026-07-31T00:00:00.000Z",
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    expect(db.calls[0]?.sql).toContain("INSERT INTO agent_spans");
    expect(db.calls[0]?.sql).not.toContain("UPDATE");
  });

  test("getTrace scopes by userId", async () => {
    const db = new FakeDatabase();
    db.responses.push({ rows: [], rowCount: 0 });
    const store = new PostgresTraceStoreAdapter(db);
    await expect(store.getTrace("user-b", "trace-1")).resolves.toBeNull();
    expect(db.calls[0]?.sql).toContain("user_id = $2");
    expect(db.calls[0]?.params).toEqual({ 1: "trace-1", 2: "user-b" });
  });
});
