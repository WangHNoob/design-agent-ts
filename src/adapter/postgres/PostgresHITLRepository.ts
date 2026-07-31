import type { DatabasePort, DbRow, QueryParams } from "../../port/infra/DatabasePort.js";
import type {
  CreateHITLCheckpointInput,
  HITLCheckpoint,
  HITLCheckpointPatch,
  HITLContentType,
  HITLCreateResult,
  HITLListOptions,
  HITLRepository,
  HITLResumePayload,
  HITLReviewAction,
  HITLReviewInput,
  HITLStage,
  HITLStatus,
  HITLTimeoutScanPort,
} from "../../port/hitl/HITLRepository.js";

const PENDING_STATUSES_SQL = `status IN ('waiting_review', 'escalated')`;

export function rowToHITLCheckpoint(row: DbRow): HITLCheckpoint {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    stage: row.stage as HITLStage,
    status: row.status as HITLStatus,
    content: row.content as string,
    contentType: row.content_type as HITLContentType,
    agentName: optionalString(row.agent_name),
    createdAt: iso(row.created_at),
    reviewedAt: optionalIso(row.reviewed_at),
    reviewAction: row.review_action as HITLReviewAction | undefined,
    reviewComment: optionalString(row.review_comment),
    modifiedContent: optionalString(row.modified_content),
    userId: row.user_id as string,
    executionId: optionalString(row.execution_id),
    taskId: optionalString(row.task_id),
    idempotencyKey: optionalString(row.idempotency_key),
    reviewPoint: row.review_point as string,
    resumeCursor: optionalString(row.resume_cursor),
    resumePayload: optionalPayload(row.resume_payload),
    reviewerId: optionalString(row.reviewer_id),
    fallback: row.fallback === true,
    updatedAt: iso(row.updated_at),
    escalatedAt: optionalIso(row.escalated_at),
  };
}

function optionalPayload(value: unknown): HITLResumePayload | undefined {
  if (value === null || value === undefined) return undefined;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as HITLResumePayload)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : iso(value);
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid database timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

export class PostgresHITLRepository implements HITLRepository {
  constructor(
    private readonly db: DatabasePort,
    private readonly userId: string,
  ) {}

  async create(input: CreateHITLCheckpointInput): Promise<HITLCreateResult> {
    const now = new Date().toISOString();
    const result = await this.db.query(
      `INSERT INTO hitl_checkpoints (
         id, user_id, session_id, execution_id, task_id, idempotency_key,
         stage, status, content, content_type, agent_name, review_point,
         resume_cursor, resume_payload, fallback, created_at, updated_at
       )
       SELECT $1, $2, s.id, $4, $5, $6, $7, 'waiting_review', $8, $9,
              $10, $11, $12, $13, false, $14, $14
       FROM sessions s
       WHERE s.id = $3
         AND s.user_id = $2
         AND ($4::varchar IS NULL OR EXISTS (
           SELECT 1 FROM executions e WHERE e.id = $4 AND e.user_id = $2
         ))
         AND ($5::varchar IS NULL OR EXISTS (
           SELECT 1
           FROM execution_tasks t
           WHERE t.id = $5
             AND t.user_id = $2
             AND ($4::varchar IS NULL OR t.execution_id = $4)
         ))
       ON CONFLICT (user_id, idempotency_key)
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING *, (xmax = 0) AS created`,
      {
        1: input.id,
        2: this.userId,
        3: input.sessionId,
        4: input.executionId ?? null,
        5: input.taskId ?? null,
        6: input.idempotencyKey ?? null,
        7: input.stage,
        8: input.content,
        9: input.contentType ?? "markdown",
        10: input.agentName ?? null,
        11: input.reviewPoint,
        12: input.resumeCursor ?? null,
        13: input.resumePayload ?? null,
        14: now,
      },
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("HITL checkpoint parents do not exist in the current user scope");
    }
    return {
      checkpoint: rowToHITLCheckpoint(row),
      created: row.created === true || row.created === "true",
    };
  }

  async get(id: string): Promise<HITLCheckpoint | null> {
    const result = await this.db.query(
      `SELECT * FROM hitl_checkpoints WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId },
    );
    return result.rows[0] ? rowToHITLCheckpoint(result.rows[0]) : null;
  }

  async list(options: HITLListOptions = {}): Promise<HITLCheckpoint[]> {
    const conditions = ["user_id = $1"];
    const params: QueryParams = { 1: this.userId };
    let index = 2;
    if (options.sessionId) {
      conditions.push(`session_id = $${index}`);
      params[index.toString()] = options.sessionId;
      index++;
    }
    if (options.executionId) {
      conditions.push(`execution_id = $${index}`);
      params[index.toString()] = options.executionId;
      index++;
    }
    if (options.pendingOnly) {
      conditions.push(`status IN ('waiting_review', 'escalated')`);
    } else if (options.status) {
      conditions.push(`status = $${index}`);
      params[index.toString()] = options.status;
      index++;
    }
    params[index.toString()] = this.normalizeLimit(options.limit);
    params[(index + 1).toString()] = this.normalizeOffset(options.offset);

    const result = await this.db.query(
      `SELECT * FROM hitl_checkpoints
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT $${index} OFFSET $${index + 1}`,
      params,
    );
    return result.rows.map((row) => rowToHITLCheckpoint(row));
  }

  async update(id: string, patch: HITLCheckpointPatch): Promise<HITLCheckpoint | null> {
    const assignments: string[] = [];
    const params: QueryParams = {};
    let index = 1;
    const fields: ReadonlyArray<[string, unknown, boolean]> = [
      ["content", patch.content, patch.content !== undefined],
      ["content_type", patch.contentType, patch.contentType !== undefined],
      ["agent_name", patch.agentName, patch.agentName !== undefined],
      ["resume_cursor", patch.resumeCursor, patch.resumeCursor !== undefined],
      ["resume_payload", patch.resumePayload, patch.resumePayload !== undefined],
    ];
    for (const [column, value, present] of fields) {
      if (!present) continue;
      assignments.push(`${column} = $${index}`);
      params[index.toString()] = value;
      index++;
    }
    assignments.push(`updated_at = $${index}`);
    params[index.toString()] = new Date().toISOString();
    params[(index + 1).toString()] = id;
    params[(index + 2).toString()] = this.userId;

    const result = await this.db.query(
      `UPDATE hitl_checkpoints
       SET ${assignments.join(", ")}
       WHERE id = $${index + 1} AND user_id = $${index + 2}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? rowToHITLCheckpoint(result.rows[0]) : null;
  }

  async review(id: string, input: HITLReviewInput): Promise<HITLCheckpoint | null> {
    const status = this.reviewStatus(input.action);
    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const result = await this.db.query(
      `UPDATE hitl_checkpoints
       SET status = $1, review_action = $2, review_comment = $3,
           modified_content = $4, reviewer_id = $5, fallback = $6,
           reviewed_at = $7, updated_at = $7
       WHERE id = $8 AND user_id = $9 AND ${PENDING_STATUSES_SQL}
       RETURNING *`,
      {
        1: status,
        2: input.action,
        3: input.comment ?? null,
        4: input.modifiedContent ?? null,
        5: input.reviewerId,
        6: input.fallback ?? false,
        7: reviewedAt,
        8: id,
        9: this.userId,
      },
    );
    return result.rows[0] ? rowToHITLCheckpoint(result.rows[0]) : null;
  }

  async expire(
    id: string,
    input: { comment?: string; reviewerId: string; reviewedAt?: string },
  ): Promise<HITLCheckpoint | null> {
    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    const result = await this.db.query(
      `UPDATE hitl_checkpoints
       SET status = 'expired', review_comment = $1, reviewer_id = $2,
           fallback = true, reviewed_at = $3, updated_at = $3
       WHERE id = $4 AND user_id = $5 AND ${PENDING_STATUSES_SQL}
       RETURNING *`,
      {
        1: input.comment ?? "HITL checkpoint expired",
        2: input.reviewerId,
        3: reviewedAt,
        4: id,
        5: this.userId,
      },
    );
    return result.rows[0] ? rowToHITLCheckpoint(result.rows[0]) : null;
  }

  async escalate(
    id: string,
    input: { comment?: string; reviewedAt?: string },
  ): Promise<HITLCheckpoint | null> {
    const at = input.reviewedAt ?? new Date().toISOString();
    // Already escalated → return current row (idempotent).
    const existing = await this.get(id);
    if (existing?.status === "escalated") return existing;

    const result = await this.db.query(
      `UPDATE hitl_checkpoints
       SET status = 'escalated', escalated_at = $1, review_comment = COALESCE($2, review_comment),
           updated_at = $1
       WHERE id = $3 AND user_id = $4 AND status = 'waiting_review'
       RETURNING *`,
      {
        1: at,
        2: input.comment ?? null,
        3: id,
        4: this.userId,
      },
    );
    return result.rows[0] ? rowToHITLCheckpoint(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM hitl_checkpoints WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId },
    );
    return result.rowCount > 0;
  }

  private reviewStatus(action: HITLReviewAction): HITLStatus {
    if (action === "approve") return "approved";
    if (action === "reject") return "rejected";
    return "modified";
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) return 50;
    return Math.max(1, Math.min(100, Math.trunc(limit)));
  }

  private normalizeOffset(offset: number | undefined): number {
    if (offset === undefined) return 0;
    return Math.max(0, Math.trunc(offset));
  }
}

/**
 * Cross-tenant scan for the HITL timeout sweeper.
 */
export class PostgresHITLTimeoutScanAdapter implements HITLTimeoutScanPort {
  constructor(private readonly db: DatabasePort) {}

  async listPendingOlderThan(cutoffIso: string, limit = 50): Promise<HITLCheckpoint[]> {
    const capped = Math.max(1, Math.min(200, Math.trunc(limit)));
    const result = await this.db.query(
      `SELECT * FROM hitl_checkpoints
       WHERE status IN ('waiting_review', 'escalated')
         AND created_at <= $1::timestamptz
       ORDER BY created_at ASC
       LIMIT $2`,
      { 1: cutoffIso, 2: capped },
    );
    return result.rows.map((row) => rowToHITLCheckpoint(row));
  }
}
