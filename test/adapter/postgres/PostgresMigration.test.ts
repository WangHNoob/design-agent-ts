import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Postgres Drizzle migrations", () => {
  test("enable extensions before creating application tables", () => {
    const migration = readFileSync(resolve("drizzle/0000_complex_anita_blake.sql"), "utf8");
    const vectorExtensionOffset = migration.indexOf('CREATE EXTENSION IF NOT EXISTS "vector"');
    const longTermMemoryOffset = migration.indexOf('CREATE TABLE "long_term_memory"');

    expect(vectorExtensionOffset).toBeGreaterThanOrEqual(0);
    expect(vectorExtensionOffset).toBeLessThan(longTermMemoryOffset);
  });
});
