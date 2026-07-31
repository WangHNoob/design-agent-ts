import type { DatabasePort, DbRow, QueryParams } from "../../port/infra/DatabasePort.js";
import type {
  CompleteExecutionAttemptInput,
  CreateExecutionAttemptInput,
  CreateExecutionInput,
  CreateExecutionTaskInput,
  ExecutionListOptions,
  ExecutionRepository,
  ExecutionTaskTransition,
  ExecutionUpdate,
  IdempotentCreateResult,
} from "../../port/execution/ExecutionRepository.js";
import type {
  Execution,
  ExecutionAttempt,
  ExecutionAttemptStatus,
  ExecutionErrorClass,
  ExecutionPayload,
  ExecutionStatus,
  ExecutionTask,
  ExecutionTaskStatus,
} from "../../port/execution/types.js";

export class PostgresExecutionRepository implements ExecutionRepository {
  constructor(
    private readonly db: DatabasePort,
    private readonly userId: string,
  ) {}

  async create(input: CreateExecutionInput): Promise<IdempotentCreateResult<Execution>> {
    const now = new Date().toISOString();
    const result = await this.db.query(
      `INSERT INTO executions (
         id, user_id, session_id, idempotency_key, status, request_payload,
         deadline_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $7)
       ON CONFLICT (user_id, idempotency_key)
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING *, (xmax = 0) AS created`,
      {
        1: input.id,
        2: this.userId,
        3: input.sessionId,
        4: input.idempotencyKey,
        5: input.requestPayload,
        6: input.deadlineAt ?? null,
        7: now,
      },
    );
    return this.idempotentExecutionResult(result.rows[0]);
  }

  async get(id: string): Promise<Execution | null> {
    const result = await this.db.query(
      `SELECT * FROM executions WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId },
    );
    return result.rows[0] ? this.rowToExecution(result.rows[0]) : null;
  }

  async list(options: ExecutionListOptions = {}): Promise<Execution[]> {
    const conditions = ["user_id = $1"];
    const params: QueryParams = { 1: this.userId };
    let index = 2;
    if (options.status) {
      conditions.push(`status = $${index}`);
      params[index.toString()] = options.status;
      index++;
    }
    if (options.sessionId) {
      conditions.push(`session_id = $${index}`);
      params[index.toString()] = options.sessionId;
      index++;
    }
    const limit = this.normalizeLimit(options.limit);
    const offset = this.normalizeOffset(options.offset);
    params[index.toString()] = limit;
    params[(index + 1).toString()] = offset;

    const result = await this.db.query(
      `SELECT * FROM executions
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      params,
    );
    return result.rows.map((row) => this.rowToExecution(row));
  }

  async update(id: string, patch: ExecutionUpdate): Promise<Execution | null> {
    const { assignments, params, nextIndex } = this.executionPatch(patch, 1);
    assignments.push(`updated_at = $${nextIndex}`);
    params[nextIndex.toString()] = new Date().toISOString();
    params[(nextIndex + 1).toString()] = id;
    params[(nextIndex + 2).toString()] = this.userId;

    const result = await this.db.query(
      `UPDATE executions
       SET ${assignments.join(", ")}
       WHERE id = $${nextIndex + 1} AND user_id = $${nextIndex + 2}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? this.rowToExecution(result.rows[0]) : null;
  }

  async transitionStatus(
    id: string,
    expectedStatus: ExecutionStatus,
    nextStatus: ExecutionStatus,
    patch: ExecutionUpdate = {},
  ): Promise<Execution | null> {
    const params: QueryParams = { 1: nextStatus };
    const { assignments, params: patchParams, nextIndex } = this.executionPatch(patch, 2);
    Object.assign(params, patchParams);
    assignments.unshift("status = $1");
    assignments.push(`updated_at = $${nextIndex}`);
    params[nextIndex.toString()] = new Date().toISOString();
    params[(nextIndex + 1).toString()] = id;
    params[(nextIndex + 2).toString()] = this.userId;
    params[(nextIndex + 3).toString()] = expectedStatus;

    const result = await this.db.query(
      `UPDATE executions
       SET ${assignments.join(", ")}
       WHERE id = $${nextIndex + 1}
         AND user_id = $${nextIndex + 2}
         AND status = $${nextIndex + 3}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? this.rowToExecution(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM executions WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId },
    );
    return result.rowCount > 0;
  }

  async createTask(input: CreateExecutionTaskInput): Promise<IdempotentCreateResult<ExecutionTask>> {
    const now = new Date().toISOString();
    const result = await this.db.query(
      `INSERT INTO execution_tasks (
         id, user_id, execution_id, task_key, name, agent_name, status,
         dependencies, input_payload, position, created_at, updated_at
       )
       SELECT $1::varchar, $2::varchar, e.id, $4::varchar, $5::varchar, $6::varchar, 'pending',
              $7::jsonb, $8::jsonb, $9::int, $10::timestamptz, $10::timestamptz
       FROM executions e
       WHERE e.id = $3::varchar AND e.user_id = $2::varchar
       ON CONFLICT (user_id, execution_id, task_key)
       DO UPDATE SET task_key = EXCLUDED.task_key
       RETURNING *, (xmax = 0) AS created`,
      {
        1: input.id,
        2: this.userId,
        3: input.executionId,
        4: input.taskKey,
        5: input.name,
        6: input.agentName ?? null,
        7: JSON.stringify(input.dependencies ?? []),
        8: JSON.stringify(input.inputPayload ?? {}),
        9: input.position ?? 0,
        10: now,
      },
    );
    const row = this.requireRow(result.rows[0], "Execution does not exist in the current user scope");
    return { entity: this.rowToTask(row), created: this.wasCreated(row) };
  }

  async getTask(id: string): Promise<ExecutionTask | null> {
    const result = await this.db.query(
      `SELECT * FROM execution_tasks WHERE id = $1 AND user_id = $2`,
      { 1: id, 2: this.userId },
    );
    return result.rows[0] ? this.rowToTask(result.rows[0]) : null;
  }

  async listTasks(executionId: string): Promise<ExecutionTask[]> {
    const result = await this.db.query(
      `SELECT * FROM execution_tasks
       WHERE execution_id = $1 AND user_id = $2
       ORDER BY position ASC, created_at ASC`,
      { 1: executionId, 2: this.userId },
    );
    return result.rows.map((row) => this.rowToTask(row));
  }

  async transitionTaskStatus(
    id: string,
    expectedStatus: ExecutionTaskStatus,
    nextStatus: ExecutionTaskStatus,
    patch: ExecutionTaskTransition = {},
  ): Promise<ExecutionTask | null> {
    const params: QueryParams = { 1: nextStatus };
    const assignments = ["status = $1"];
    let index = 2;
    const fields: ReadonlyArray<[string, unknown, boolean]> = [
      ["output_payload", patch.outputPayload, patch.outputPayload !== undefined],
      ["resume_cursor", patch.resumeCursor, patch.resumeCursor !== undefined],
      ["resume_payload", patch.resumePayload, patch.resumePayload !== undefined],
      ["error_class", patch.errorClass, patch.errorClass !== undefined],
      ["error_message", patch.errorMessage, patch.errorMessage !== undefined],
      ["started_at", patch.startedAt, patch.startedAt !== undefined],
      ["completed_at", patch.completedAt, patch.completedAt !== undefined],
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
    params[(index + 3).toString()] = expectedStatus;

    const result = await this.db.query(
      `UPDATE execution_tasks
       SET ${assignments.join(", ")}
       WHERE id = $${index + 1}
         AND user_id = $${index + 2}
         AND status = $${index + 3}
       RETURNING *`,
      params,
    );
    return result.rows[0] ? this.rowToTask(result.rows[0]) : null;
  }

  async createAttempt(
    input: CreateExecutionAttemptInput,
  ): Promise<IdempotentCreateResult<ExecutionAttempt>> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const result = await this.db.query(
      `INSERT INTO execution_attempts (
         id, user_id, execution_id, task_id, attempt_number, status,
         input_payload, started_at, created_at
       )
       SELECT $1::varchar, $2::varchar, t.execution_id, t.id, $5::int, 'running',
              $6::jsonb, $7::timestamptz, $7::timestamptz
       FROM execution_tasks t
       WHERE t.id = $4::varchar AND t.execution_id = $3::varchar AND t.user_id = $2::varchar
       ON CONFLICT (user_id, task_id, attempt_number)
       DO UPDATE SET attempt_number = EXCLUDED.attempt_number
       RETURNING *, (xmax = 0) AS created`,
      {
        1: input.id,
        2: this.userId,
        3: input.executionId,
        4: input.taskId,
        5: input.attemptNumber,
        6: JSON.stringify(input.inputPayload ?? {}),
        7: startedAt,
      },
    );
    const row = this.requireRow(result.rows[0], "Execution task does not exist in the current user scope");
    return { entity: this.rowToAttempt(row), created: this.wasCreated(row) };
  }

  async listAttempts(taskId: string): Promise<ExecutionAttempt[]> {
    const result = await this.db.query(
      `SELECT * FROM execution_attempts
       WHERE task_id = $1 AND user_id = $2
       ORDER BY attempt_number ASC`,
      { 1: taskId, 2: this.userId },
    );
    return result.rows.map((row) => this.rowToAttempt(row));
  }

  async completeAttempt(
    id: string,
    input: CompleteExecutionAttemptInput,
  ): Promise<ExecutionAttempt | null> {
    const result = await this.db.query(
      `UPDATE execution_attempts
       SET status = $1, error_class = $2, error_code = $3, error_message = $4,
           output_payload = $5, finished_at = $6
       WHERE id = $7 AND user_id = $8 AND status = 'running'
       RETURNING *`,
      {
        1: input.status,
        2: input.errorClass ?? null,
        3: input.errorCode ?? null,
        4: input.errorMessage ?? null,
        5: input.outputPayload ?? null,
        6: input.finishedAt ?? new Date().toISOString(),
        7: id,
        8: this.userId,
      },
    );
    return result.rows[0] ? this.rowToAttempt(result.rows[0]) : null;
  }

  private executionPatch(
    patch: ExecutionUpdate,
    startIndex: number,
  ): { assignments: string[]; params: QueryParams; nextIndex: number } {
    const assignments: string[] = [];
    const params: QueryParams = {};
    let index = startIndex;
    const fields: ReadonlyArray<[string, unknown, boolean]> = [
      ["plan_payload", patch.planPayload, patch.planPayload !== undefined],
      ["result_payload", patch.resultPayload, patch.resultPayload !== undefined],
      ["resume_cursor", patch.resumeCursor, patch.resumeCursor !== undefined],
      ["resume_payload", patch.resumePayload, patch.resumePayload !== undefined],
      ["error_class", patch.errorClass, patch.errorClass !== undefined],
      ["error_message", patch.errorMessage, patch.errorMessage !== undefined],
      ["deadline_at", patch.deadlineAt, patch.deadlineAt !== undefined],
      ["started_at", patch.startedAt, patch.startedAt !== undefined],
      ["completed_at", patch.completedAt, patch.completedAt !== undefined],
    ];
    for (const [column, value, present] of fields) {
      if (!present) continue;
      assignments.push(`${column} = $${index}`);
      params[index.toString()] = value;
      index++;
    }
    return { assignments, params, nextIndex: index };
  }

  private idempotentExecutionResult(row: DbRow | undefined): IdempotentCreateResult<Execution> {
    const required = this.requireRow(row, "Execution insert did not return a row");
    return { entity: this.rowToExecution(required), created: this.wasCreated(required) };
  }

  private rowToExecution(row: DbRow): Execution {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      sessionId: row.session_id as string,
      idempotencyKey: row.idempotency_key as string,
      status: row.status as ExecutionStatus,
      requestPayload: this.payload(row.request_payload),
      planPayload: this.optionalPayload(row.plan_payload),
      resultPayload: this.optionalPayload(row.result_payload),
      resumeCursor: this.optionalString(row.resume_cursor),
      resumePayload: this.optionalPayload(row.resume_payload),
      errorClass: row.error_class as ExecutionErrorClass | undefined,
      errorMessage: this.optionalString(row.error_message),
      deadlineAt: this.optionalIso(row.deadline_at),
      startedAt: this.optionalIso(row.started_at),
      completedAt: this.optionalIso(row.completed_at),
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
    };
  }

  private rowToTask(row: DbRow): ExecutionTask {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      executionId: row.execution_id as string,
      taskKey: row.task_key as string,
      name: row.name as string,
      agentName: this.optionalString(row.agent_name),
      status: row.status as ExecutionTaskStatus,
      dependencies: Array.isArray(row.dependencies) ? (row.dependencies as string[]) : [],
      inputPayload: this.payload(row.input_payload),
      outputPayload: this.optionalPayload(row.output_payload),
      resumeCursor: this.optionalString(row.resume_cursor),
      resumePayload: this.optionalPayload(row.resume_payload),
      position: Number(row.position),
      errorClass: row.error_class as ExecutionErrorClass | undefined,
      errorMessage: this.optionalString(row.error_message),
      startedAt: this.optionalIso(row.started_at),
      completedAt: this.optionalIso(row.completed_at),
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
    };
  }

  private rowToAttempt(row: DbRow): ExecutionAttempt {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      executionId: row.execution_id as string,
      taskId: row.task_id as string,
      attemptNumber: Number(row.attempt_number),
      status: row.status as ExecutionAttemptStatus,
      errorClass: row.error_class as ExecutionErrorClass | undefined,
      errorCode: this.optionalString(row.error_code),
      errorMessage: this.optionalString(row.error_message),
      inputPayload: this.payload(row.input_payload),
      outputPayload: this.optionalPayload(row.output_payload),
      startedAt: this.iso(row.started_at),
      finishedAt: this.optionalIso(row.finished_at),
      createdAt: this.iso(row.created_at),
    };
  }

  private payload(value: unknown): ExecutionPayload {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ExecutionPayload)
      : {};
  }

  private optionalPayload(value: unknown): ExecutionPayload | undefined {
    return value === null || value === undefined ? undefined : this.payload(value);
  }

  private optionalString(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
  }

  private optionalIso(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : this.iso(value);
  }

  private iso(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new TypeError(`Invalid database timestamp: ${String(value)}`);
    }
    return date.toISOString();
  }

  private wasCreated(row: DbRow): boolean {
    return row.created === true || row.created === "true";
  }

  private requireRow(row: DbRow | undefined, message: string): DbRow {
    if (!row) throw new Error(message);
    return row;
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
