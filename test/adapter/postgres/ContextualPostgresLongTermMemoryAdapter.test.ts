import { describe, expect, test } from "vitest";
import { NodeContextStorageAdapter } from "../../../src/adapter/infra/NodeContextStorageAdapter.js";
import { ContextualPostgresLongTermMemoryAdapter } from "../../../src/adapter/postgres/ContextualPostgresLongTermMemoryAdapter.js";
import type {
  DatabasePort,
  QueryParams,
  QueryResult,
  TransactionOptions,
} from "../../../src/port/infra/DatabasePort.js";
import type { TenantContext } from "../../../src/port/user/TenantIsolationPort.js";

class FakeDatabase implements DatabasePort {
  readonly calls: Array<{ sql: string; params?: QueryParams }> = [];
  async query(sql: string, params?: QueryParams): Promise<QueryResult> {
    this.calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
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

const tenant = (userId: string): TenantContext => ({
  userId,
  role: "user",
  sessionId: `auth-${userId}`,
});

describe("ContextualPostgresLongTermMemoryAdapter", () => {
  test("fails closed outside a tenant request", async () => {
    const adapter = new ContextualPostgresLongTermMemoryAdapter(
      new FakeDatabase(),
      { randomUUID: () => "memory-1" },
      new NodeContextStorageAdapter<TenantContext>(),
    );

    expect(() => adapter.get("global", "key")).toThrow("Tenant context is required");
  });

  test("binds parallel operations to their own ALS user", async () => {
    const db = new FakeDatabase();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    let sequence = 0;
    const adapter = new ContextualPostgresLongTermMemoryAdapter(
      db,
      { randomUUID: () => `memory-${++sequence}` },
      storage,
    );
    const params = {
      semanticType: "profile" as const,
      namespace: "global",
      key: "language",
      content: "中文",
    };

    await Promise.all([
      storage.run(tenant("user-a"), () => adapter.store(params)),
      storage.run(tenant("user-b"), () => adapter.store(params)),
    ]);

    expect(db.calls.map((call) => call.params?.[2]).sort()).toEqual(["user-a", "user-b"]);
  });
});
