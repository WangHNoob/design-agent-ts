import { describe, expect, test, vi } from "vitest";

vi.mock("pg", () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  class Pool {
    query(sql: string, values?: unknown[]) {
      queries.push({ sql, values: values ?? [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    end() {
      return Promise.resolve();
    }
  }
  return {
    default: { Pool },
    __queries: queries,
  };
});

describe("PostgresDatabaseAdapter.convertParams", () => {
  test("numeric keys keep duplicate placeholders without expanding slots", async () => {
    const pg = await import("pg");
    const queries = (pg as unknown as { __queries: Array<{ sql: string; values: unknown[] }> }).__queries;
    queries.length = 0;

    const { PostgresDatabaseAdapter } = await import(
      "../../../src/adapter/postgres/PostgresDatabaseAdapter.js"
    );
    const db = new PostgresDatabaseAdapter("postgres://unused");
    await db.query(
      `SELECT ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $3)) AS text_score
       FROM long_term_memory WHERE user_id = $1 AND namespace = $2
       ORDER BY (ts_rank_cd(to_tsvector('simple', content), plainto_tsquery('simple', $3)) * 0.5) DESC
       LIMIT $4::int`,
      { 1: "u1", 2: "ns", 3: "arpg", 4: 10 },
    );

    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain("plainto_tsquery('simple', $3)");
    expect(queries[0]!.sql).toContain("LIMIT $4::int");
    expect(queries[0]!.values).toEqual(["u1", "ns", "arpg", 10]);
  });

  test("named keys map each unique name to one positional index", async () => {
    const pg = await import("pg");
    const queries = (pg as unknown as { __queries: Array<{ sql: string; values: unknown[] }> }).__queries;
    queries.length = 0;

    const { PostgresDatabaseAdapter } = await import(
      "../../../src/adapter/postgres/PostgresDatabaseAdapter.js"
    );
    const db = new PostgresDatabaseAdapter("postgres://unused");
    await db.query(
      "SELECT * FROM users WHERE id = $id AND (email = $email OR backup = $email)",
      { id: "123", email: "a@b.c" },
    );

    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toBe(
      "SELECT * FROM users WHERE id = $1 AND (email = $2 OR backup = $2)",
    );
    expect(queries[0]!.values).toEqual(["123", "a@b.c"]);
  });
});
