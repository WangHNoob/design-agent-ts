import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

const userId = varchar("user_id", { length: 36 }).notNull();
const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const userAssets = pgTable(
  "user_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    assetType: varchar("asset_type", { length: 50 }).notNull(),
    assetKey: varchar("asset_key", { length: 255 }).notNull(),
    data: jsonb("data").notNull().default({}),
    owner: varchar("owner", { length: 10 }).notNull().default("user"),
    isMutable: boolean("is_mutable").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique().on(table.assetType, table.assetKey, table.userId),
    index("idx_user_assets_user_type").on(table.userId, table.assetType),
    index("idx_user_assets_system").on(table.owner, table.assetType).where(sql`${table.owner} = 'system'`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    requirement: text("requirement").notNull(),
    mode: varchar("mode", { length: 20 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    output: text("output"),
    error: text("error"),
    hitlCheckpointId: varchar("hitl_checkpoint_id", { length: 100 }),
    createdAt,
    updatedAt,
  },
  (table) => [index("idx_sessions_user").on(table.userId, table.status)],
);

export const executions = pgTable(
  "executions",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    sessionId: varchar("session_id", { length: 100 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    requestPayload: jsonb("request_payload").notNull().default({}),
    planPayload: jsonb("plan_payload"),
    resultPayload: jsonb("result_payload"),
    resumeCursor: varchar("resume_cursor", { length: 255 }),
    resumePayload: jsonb("resume_payload"),
    errorClass: varchar("error_class", { length: 20 }),
    errorMessage: text("error_message"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("executions_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("idx_executions_user_status_created").on(table.userId, table.status, table.createdAt),
    index("idx_executions_user_session").on(table.userId, table.sessionId, table.createdAt),
    check(
      "executions_status_check",
      sql`${table.status} in ('queued', 'running', 'waiting_hitl', 'completed', 'failed', 'cancelled', 'timed_out')`,
    ),
  ],
);

export const executionTasks = pgTable(
  "execution_tasks",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    executionId: varchar("execution_id", { length: 100 })
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    taskKey: varchar("task_key", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    agentName: varchar("agent_name", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    dependencies: jsonb("dependencies").notNull().default([]),
    inputPayload: jsonb("input_payload").notNull().default({}),
    outputPayload: jsonb("output_payload"),
    resumeCursor: varchar("resume_cursor", { length: 255 }),
    resumePayload: jsonb("resume_payload"),
    position: integer("position").notNull().default(0),
    errorClass: varchar("error_class", { length: 20 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("execution_tasks_user_execution_key_unique").on(table.userId, table.executionId, table.taskKey),
    index("idx_execution_tasks_user_execution_status").on(table.userId, table.executionId, table.status),
    check(
      "execution_tasks_status_check",
      sql`${table.status} in ('pending', 'running', 'success', 'error', 'skipped', 'cancelled')`,
    ),
  ],
);

export const executionAttempts = pgTable(
  "execution_attempts",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    executionId: varchar("execution_id", { length: 100 })
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 100 })
      .notNull()
      .references(() => executionTasks.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    errorClass: varchar("error_class", { length: 20 }),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    inputPayload: jsonb("input_payload").notNull().default({}),
    outputPayload: jsonb("output_payload"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    unique("execution_attempts_user_task_number_unique").on(table.userId, table.taskId, table.attemptNumber),
    index("idx_execution_attempts_user_execution_task").on(table.userId, table.executionId, table.taskId),
    index("idx_execution_attempts_user_status").on(table.userId, table.status),
    check(
      "execution_attempts_status_check",
      sql`${table.status} in ('running', 'success', 'error', 'cancelled', 'timed_out')`,
    ),
    check(
      "execution_attempts_error_class_check",
      sql`${table.errorClass} is null or ${table.errorClass} in ('transient', 'permanent', 'cancelled', 'timeout')`,
    ),
  ],
);

export const hitlCheckpoints = pgTable(
  "hitl_checkpoints",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    sessionId: varchar("session_id", { length: 100 })
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    executionId: varchar("execution_id", { length: 100 }).references(() => executions.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 100 }).references(() => executionTasks.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    stage: varchar("stage", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("waiting_review"),
    content: text("content").notNull(),
    contentType: varchar("content_type", { length: 20 }).notNull().default("markdown"),
    agentName: varchar("agent_name", { length: 100 }),
    reviewPoint: varchar("review_point", { length: 100 }).notNull(),
    resumeCursor: varchar("resume_cursor", { length: 255 }),
    resumePayload: jsonb("resume_payload"),
    reviewerId: varchar("reviewer_id", { length: 36 }),
    fallback: boolean("fallback").notNull().default(false),
    reviewAction: varchar("review_action", { length: 20 }),
    reviewComment: text("review_comment"),
    modifiedContent: text("modified_content"),
    createdAt,
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    updatedAt,
  },
  (table) => [
    unique("hitl_checkpoints_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("idx_hitl_checkpoints_user_status_created").on(table.userId, table.status, table.createdAt),
    index("idx_hitl_checkpoints_user_session").on(table.userId, table.sessionId, table.createdAt),
    index("idx_hitl_checkpoints_user_execution_review").on(table.userId, table.executionId, table.reviewPoint),
    check("hitl_checkpoints_stage_check", sql`${table.stage} in ('plan', 'subagent', 'integrate')`),
    check(
      "hitl_checkpoints_status_check",
      sql`${table.status} in ('waiting_review', 'approved', 'rejected', 'modified', 'expired', 'escalated')`,
    ),
    check(
      "hitl_checkpoints_content_type_check",
      sql`${table.contentType} in ('markdown', 'json')`,
    ),
    check(
      "hitl_checkpoints_review_action_check",
      sql`${table.reviewAction} is null or ${table.reviewAction} in ('approve', 'reject', 'modify')`,
    ),
  ],
);

export const longTermMemory = pgTable(
  "long_term_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    semanticType: varchar("semantic_type", { length: 20 }).notNull(),
    namespace: varchar("namespace", { length: 100 }).notNull(),
    key: varchar("key", { length: 255 }).notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    importance: real("importance").notNull().default(0.5),
    accessCount: integer("access_count").notNull().default(0),
    tags: text("tags").array(),
    ttlMs: bigint("ttl_ms", { mode: "number" }),
    createdAt,
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ltm_user_ns").on(table.userId, table.namespace),
    index("idx_ltm_type").on(table.semanticType),
  ],
);

/** Observability: one row per chat session that has produced agent traces. */
export const agentTraceSessions = pgTable(
  "agent_trace_sessions",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    sessionId: varchar("session_id", { length: 100 }).notNull(),
    createdAt,
  },
  (table) => [
    unique("agent_trace_sessions_user_session_unique").on(table.userId, table.sessionId),
    index("idx_agent_trace_sessions_user_session").on(table.userId, table.sessionId),
  ],
);

/** One agent run (Director execute / stream). */
export const agentTraces = pgTable(
  "agent_traces",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    traceSessionId: varchar("trace_session_id", { length: 100 })
      .notNull()
      .references(() => agentTraceSessions.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 100 }).notNull(),
    executionId: varchar("execution_id", { length: 100 }),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("unset"),
    attributes: jsonb("attributes").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    index("idx_agent_traces_user_session").on(table.userId, table.sessionId, table.startedAt),
    index("idx_agent_traces_user_execution").on(table.userId, table.executionId),
    check("agent_traces_status_check", sql`${table.status} in ('ok', 'error', 'unset')`),
  ],
);

/** Immutable span rows (write-once). Nine phases align with ReAct hook points. */
export const agentSpans = pgTable(
  "agent_spans",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId,
    traceId: varchar("trace_id", { length: 100 })
      .notNull()
      .references(() => agentTraces.id, { onDelete: "cascade" }),
    parentSpanId: varchar("parent_span_id", { length: 100 }),
    name: varchar("name", { length: 255 }).notNull(),
    phase: varchar("phase", { length: 40 }),
    kind: varchar("kind", { length: 20 }).notNull().default("internal"),
    status: varchar("status", { length: 20 }).notNull().default("unset"),
    attributes: jsonb("attributes").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (table) => [
    index("idx_agent_spans_user_trace").on(table.userId, table.traceId, table.startedAt),
    index("idx_agent_spans_parent").on(table.userId, table.parentSpanId),
    check("agent_spans_kind_check", sql`${table.kind} in ('internal', 'client', 'server')`),
    check("agent_spans_status_check", sql`${table.status} in ('ok', 'error', 'unset')`),
    check(
      "agent_spans_phase_check",
      sql`${table.phase} is null or ${table.phase} in (
        'pre_reasoning', 'post_reasoning',
        'pre_tool_execution', 'post_tool_execution',
        'pre_summary', 'post_summary',
        'pre_agent_call', 'post_agent_call',
        'on_error'
      )`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey(),
    userId,
    action: varchar("action", { length: 50 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: varchar("resource_id", { length: 255 }),
    sessionId: varchar("session_id", { length: 100 }),
    executionId: varchar("execution_id", { length: 100 }),
    traceId: varchar("trace_id", { length: 100 }),
    outcome: varchar("outcome", { length: 20 }).notNull(),
    detail: jsonb("detail").notNull().default({}),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt,
  },
  (table) => [
    index("idx_audit_logs_user_created").on(table.userId, table.createdAt),
    index("idx_audit_logs_user_action").on(table.userId, table.action, table.createdAt),
    check("audit_logs_outcome_check", sql`${table.outcome} in ('success', 'denied', 'error')`),
  ],
);
