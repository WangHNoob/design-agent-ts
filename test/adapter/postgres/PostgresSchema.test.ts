import { describe, expect, test } from "vitest";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  agentSpans,
  agentTraces,
  agentTraceSessions,
  executionAttempts,
  executions,
  executionTasks,
  hitlCheckpoints,
  longTermMemory,
  sessions,
  userAssets,
} from "../../../src/adapter/postgres/schema.js";

describe("Postgres Drizzle schema", () => {
  test("declares application tables without owning Better Auth tables", () => {
    expect(getTableName(userAssets)).toBe("user_assets");
    expect(getTableName(sessions)).toBe("sessions");
    expect(getTableName(longTermMemory)).toBe("long_term_memory");
    expect(getTableName(executions)).toBe("executions");
    expect(getTableName(executionTasks)).toBe("execution_tasks");
    expect(getTableName(executionAttempts)).toBe("execution_attempts");
    expect(getTableName(hitlCheckpoints)).toBe("hitl_checkpoints");
    expect(getTableName(agentTraceSessions)).toBe("agent_trace_sessions");
    expect(getTableName(agentTraces)).toBe("agent_traces");
    expect(getTableName(agentSpans)).toBe("agent_spans");
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
    expect(config.columns.find((column) => column.name === "user_id")?.notNull).toBe(true);
  });

  test("declares tenant-safe execution state and idempotency fields", () => {
    const config = getTableConfig(executions);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "user_id",
        "session_id",
        "idempotency_key",
        "status",
        "request_payload",
        "plan_payload",
        "result_payload",
        "resume_cursor",
        "resume_payload",
        "error_class",
        "deadline_at",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "idx_executions_user_status_created",
        "idx_executions_user_session",
      ]),
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "executions_user_idempotency_unique",
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "executions_status_check",
    );
  });

  test("declares dependency-aware tasks and classified attempts", () => {
    const taskConfig = getTableConfig(executionTasks);
    const attemptConfig = getTableConfig(executionAttempts);

    expect(taskConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "user_id",
        "execution_id",
        "task_key",
        "dependencies",
        "status",
        "resume_cursor",
        "resume_payload",
      ]),
    );
    expect(taskConfig.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "execution_tasks_user_execution_key_unique",
    );
    expect(attemptConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "user_id",
        "execution_id",
        "task_id",
        "attempt_number",
        "status",
        "error_class",
        "error_code",
        "error_message",
      ]),
    );
    expect(attemptConfig.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "execution_attempts_status_check",
        "execution_attempts_error_class_check",
      ]),
    );
  });

  test("preserves HITL API fields and durable resume metadata", () => {
    const config = getTableConfig(hitlCheckpoints);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "session_id",
        "stage",
        "status",
        "content",
        "content_type",
        "agent_name",
        "created_at",
        "reviewed_at",
        "review_action",
        "review_comment",
        "modified_content",
        "user_id",
        "review_point",
        "resume_cursor",
        "resume_payload",
        "reviewer_id",
        "fallback",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "idx_hitl_checkpoints_user_status_created",
        "idx_hitl_checkpoints_user_session",
        "idx_hitl_checkpoints_user_execution_review",
      ]),
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.getName())).toContain(
      "hitl_checkpoints_user_idempotency_unique",
    );
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
