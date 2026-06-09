import { describe, expect, test } from "vitest";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { longTermMemory, sessions, userAssets } from "../../../src/adapter/postgres/schema.js";

describe("Postgres Drizzle schema", () => {
  test("declares application tables without owning Better Auth tables", () => {
    expect(getTableName(userAssets)).toBe("user_assets");
    expect(getTableName(sessions)).toBe("sessions");
    expect(getTableName(longTermMemory)).toBe("long_term_memory");
  });

  test("keeps user assets scoped by user and asset identity", () => {
    const config = getTableConfig(userAssets);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["id", "user_id", "asset_type", "asset_key", "data", "owner", "is_mutable"]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining(["idx_user_assets_user_type", "idx_user_assets_system"]),
    );
    expect(config.indexes.find((index) => index.config.name === "idx_user_assets_system")?.config.where).toBeDefined();
    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "user_assets_asset_type_asset_key_user_id_unique",
    );
  });

  test("keeps sessions scoped to a Better Auth user", () => {
    const config = getTableConfig(sessions);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "requirement",
        "mode",
        "role",
        "status",
        "output",
        "error",
        "hitl_checkpoint_id",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toContain("idx_sessions_user");
  });

  test("declares long-term memory fields needed for tenant-safe recall", () => {
    const config = getTableConfig(longTermMemory);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "semantic_type",
        "namespace",
        "key",
        "content",
        "embedding",
        "importance",
        "access_count",
        "tags",
        "ttl_ms",
        "created_at",
        "last_accessed_at",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining(["idx_ltm_user_ns", "idx_ltm_type"]),
    );
  });
});
