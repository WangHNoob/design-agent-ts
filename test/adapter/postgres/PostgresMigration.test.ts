import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Postgres Drizzle migrations", () => {
  test("enables extensions before creating application tables in 0000", () => {
    const migration = readFileSync(resolve("drizzle/0000_complex_anita_blake.sql"), "utf8");
    const vectorExtensionOffset = migration.indexOf('CREATE EXTENSION IF NOT EXISTS "vector"');
    const longTermMemoryOffset = migration.indexOf('CREATE TABLE "long_term_memory"');

    expect(vectorExtensionOffset).toBeGreaterThanOrEqual(0);
    expect(vectorExtensionOffset).toBeLessThan(longTermMemoryOffset);
  });

  test("adds durable execution and HITL tables without replacing 0000", () => {
    const migration = readFileSync(
      resolve("drizzle/0001_execution_persistence.sql"),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "executions"');
    expect(migration).toContain('CREATE TABLE "execution_tasks"');
    expect(migration).toContain('CREATE TABLE "execution_attempts"');
    expect(migration).toContain('CREATE TABLE "hitl_checkpoints"');
    expect(migration).toContain(
      'ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL',
    );
    expect(migration).toContain(
      'CONSTRAINT "executions_user_idempotency_unique" UNIQUE("user_id","idempotency_key")',
    );
    expect(migration).toContain(
      'CONSTRAINT "execution_attempts_error_class_check"',
    );
    expect(migration).toContain(
      'CREATE INDEX "idx_hitl_checkpoints_user_status_created"',
    );
  });

  test("adds Better Auth tables in 0002", () => {
    const migration = readFileSync(resolve("drizzle/0002_better_auth.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "session"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "account"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "verification"');
  });

  test("adds agent Session/Trace/Span tables in 0003", () => {
    const migration = readFileSync(resolve("drizzle/0003_agent_traces.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_trace_sessions"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_traces"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "agent_spans"');
    expect(migration).toContain("pre_reasoning");
    expect(migration).toContain("post_summary");
  });

  test("adds HITL ops statuses in 0004", () => {
    const migration = readFileSync(resolve("drizzle/0004_hitl_ops.sql"), "utf8");
    expect(migration).toContain("'expired'");
    expect(migration).toContain("'escalated'");
    expect(migration).toContain('"escalated_at"');
  });

  test("adds audit_logs table in 0005", () => {
    const migration = readFileSync(resolve("drizzle/0005_audit_logs.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "audit_logs"');
    expect(migration).toContain('"outcome"');
    expect(migration).toContain("idx_audit_logs_user_created");
    expect(migration).toContain("audit_logs_outcome_check");
  });

  test("adds cost_usage table in 0006", () => {
    const migration = readFileSync(resolve("drizzle/0006_cost_usage.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "cost_usage"');
    expect(migration).toContain("idx_cost_usage_user_created");
    expect(migration).toContain("idx_cost_usage_created");
  });

  test("adds artifact version tables in 0007", () => {
    const migration = readFileSync(resolve("drizzle/0007_artifact_versions.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "artifact_versions"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "session_version_snapshots"');
    expect(migration).toContain('"version_snapshot_id"');
    expect(migration).toContain("artifact_versions_canary_check");
  });

  test("adds outcome-signal columns and closes schema drift in 0008", () => {
    const migration = readFileSync(resolve("drizzle/0008_fat_supernaut.sql"), "utf8");
    expect(migration).toContain('ALTER TABLE "executions" ADD COLUMN "requirement_hash" varchar(64)');
    expect(migration).toContain('ALTER TABLE "executions" ADD COLUMN "outcome_signal" jsonb');
    expect(migration).toContain('CREATE INDEX "idx_executions_requirement_hash"');
    // Cumulative drift from earlier phases that had to be closed here.
    expect(migration).toContain('ALTER TABLE "sessions" ADD COLUMN "version_snapshot_id" uuid');
    expect(migration).toContain('ALTER TABLE "hitl_checkpoints" ADD COLUMN "escalated_at"');
  });

  test("adds executions.mode for observer mode statistics in 0009", () => {
    const migration = readFileSync(resolve("drizzle/0009_tranquil_misty_knight.sql"), "utf8");
    expect(migration).toContain('ALTER TABLE "executions" ADD COLUMN "mode" varchar(20)');
  });

  test("adds user_signal_events for observer sampling signals in 0010", () => {
    const migration = readFileSync(resolve("drizzle/0010_right_famine.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE "user_signal_events"');
    expect(migration).toContain('"kind" varchar(20)');
    expect(migration).toContain('"rating" integer');
  });

  test("keeps the migration journal and snapshot in sync", () => {
    const journal = JSON.parse(
      readFileSync(resolve("drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string }> };
    const snapshot = JSON.parse(
      readFileSync(resolve("drizzle/meta/0010_snapshot.json"), "utf8"),
    ) as {
      tables: Record<string, {
        columns: Record<string, { notNull: boolean }>;
      }>;
    };

    expect(journal.entries.map((e) => e.tag)).toEqual([
      "0000_complex_anita_blake",
      "0001_execution_persistence",
      "0002_better_auth",
      "0003_agent_traces",
      "0004_hitl_ops",
      "0005_audit_logs",
      "0006_cost_usage",
      "0007_artifact_versions",
      "0008_fat_supernaut",
      "0009_tranquil_misty_knight",
      "0010_right_famine",
    ]);
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 10,
      tag: "0010_right_famine",
    });
    expect(Object.keys(snapshot.tables)).toEqual(
      expect.arrayContaining([
        "public.executions",
        "public.execution_tasks",
        "public.execution_attempts",
        "public.hitl_checkpoints",
      ]),
    );
    expect(snapshot.tables["public.sessions"]?.columns.user_id?.notNull).toBe(true);
  });
});
