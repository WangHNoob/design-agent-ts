import type {
  DirectorAgent,
  DirectorStreamOptions,
  StreamEvent,
} from "../../core/agent/director/DirectorAgent.js";
import { ErrorClassifier } from "../../core/execution/ErrorClassifier.js";
import { ExecutionService } from "../../core/execution/ExecutionService.js";
import { ExecutionStateMachine } from "../../core/execution/ExecutionStateMachine.js";
import { buildOutcomeSignal } from "../../core/execution/outcomeSignal.js";
import type { InflightLane, InflightLimiter } from "../../core/execution/InflightLimiter.js";
import type { TaskPlan } from "../../core/schema/TaskPlan.js";
import type { TaskResult } from "../../core/schema/TaskResult.js";
import type { UserContextManager } from "../../core/user/UserContextManager.js";
import type { ExecutionEventStore } from "../../port/execution/ExecutionEventStore.js";
import type { ExecutionRepository } from "../../port/execution/ExecutionRepository.js";
import type {
  Execution,
  ExecutionAttempt,
  ExecutionTask,
  ExecutionTaskStatus,
} from "../../port/execution/types.js";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type {
  MessageQueuePort,
  MessageResult,
  QueueMessage,
} from "../../port/queue/MessageQueuePort.js";
import type { SessionRepository, SessionMeta } from "../../port/session/SessionRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import type { ExecutionOverrides } from "../../core/versioning/buildExecutionOverrides.js";

export const EXECUTION_QUEUE = "executions";

export interface ExecutionQueuePayload {
  readonly executionId: string;
  readonly userId: string;
  /** Used for lane limiting; if missing, worker loads mode from execution.requestPayload */
  readonly mode?: "design" | "query" | "table";
}

interface ExecutePayload {
  requirement: string;
  mode: "design" | "query" | "table";
  role: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ExecutionWorkerDependencies {
  queue: MessageQueuePort;
  eventStore: ExecutionEventStore;
  executionRepositoryFactory: (userId: string) => ExecutionRepository;
  sessionRepositoryFactory: (userId: string) => SessionRepository;
  userContextManager: UserContextManager;
  contextStorage: ContextStoragePort<TenantContext>;
  idGenerator: IdGeneratorPort;
  inflightLimiter: InflightLimiter;
  maxConcurrentPerUser: number;
  pollIntervalMs: number;
  taskTimeoutMs: number;
  /** Short sleep before defer return to avoid claim/requeue/xadd spin when a lane is full (ms). Default 75. */
  deferBackoffMs?: number;
  now?: () => Date;
  /** Build MVCC execution overrides from session metadata. */
  executionOverridesFactory?: (
    session: SessionMeta | null,
    userId: string,
  ) => Promise<ExecutionOverrides | undefined>;
}

export class ExecutionWorker {
  private director: DirectorAgent | null = null;
  private subscribed = false;
  private started = false;
  private readonly activeExecutions = new Set<string>();
  private readonly now: () => Date;

  constructor(private readonly deps: ExecutionWorkerDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  setDirector(director: DirectorAgent): void {
    this.director = director;
  }

  hasDirector(): boolean {
    return this.director !== null;
  }

  hasActiveExecutions(): boolean {
    return this.activeExecutions.size > 0;
  }

  async start(): Promise<void> {
    if (!this.director || this.started) return;
    if (!this.subscribed) {
      await this.deps.queue.subscribe<ExecutionQueuePayload>(
        EXECUTION_QUEUE,
        (message) => this.handleMessage(message),
      );
      this.subscribed = true;
    }
    await this.deps.queue.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.deps.queue.stop();
    this.started = false;
  }

  async handleMessage(message: QueueMessage<unknown>): Promise<MessageResult> {
    let payload: ExecutionQueuePayload;
    try {
      payload = this.parsePayload(message);
    } catch (error) {
      return { success: false, retry: false, error: ErrorClassifier.message(error) };
    }
    if (!this.director) {
      return { success: false, retry: true, error: "Director is not configured" };
    }

    const repository = this.deps.executionRepositoryFactory(payload.userId);
    const sessionRepository = this.deps.sessionRepositoryFactory(payload.userId);
    const executionService = new ExecutionService(
      repository,
      this.deps.idGenerator,
      this.now,
    );
    const execution = await repository.get(payload.executionId);
    if (!execution) {
      return { success: false, retry: false, error: "Execution not found" };
    }
    if (execution.userId !== payload.userId) {
      return { success: false, retry: false, error: "Execution tenant mismatch" };
    }
    if (ExecutionStateMachine.isTerminal(execution.status)) {
      return { success: true };
    }

    const context: TenantContext = {
      userId: payload.userId,
      role: "user",
      sessionId: execution.sessionId,
    };
    return this.deps.contextStorage.run(
      context,
      () => this.runExecution(
        message,
        execution,
        repository,
        sessionRepository,
        executionService,
        context,
      ),
    );
  }

  private async runExecution(
    message: QueueMessage<unknown>,
    initialExecution: Execution,
    repository: ExecutionRepository,
    sessionRepository: SessionRepository,
    service: ExecutionService,
    context: TenantContext,
  ): Promise<MessageResult> {
    // Prefer lane acquire while still queued — avoids claim→requeue churn when the lane is full.
    const lane = this.resolveInflightLane(initialExecution);
    if (!this.deps.inflightLimiter.tryAcquire(lane)) {
      this.logInflight(initialExecution.id, lane, "lane full");
      await this.sleepDeferBackoff();
      return {
        success: false,
        defer: true,
        error: "Execution inflight lane full",
      };
    }

    let execution = initialExecution;
    let tenantAcquired = false;
    // Review points passed so far — collected in the stream loop, attached to the
    // terminal outcome signal (flywheel 01-P4). Declared here so the catch path
    // (which sees a stream error after HITL checkpoints) can include them too.
    const hitlCheckpoints: string[] = [];
    try {
      if (execution.status === "queued") {
        try {
          execution = await service.claim(execution.id);
        } catch {
          const current = await repository.get(execution.id);
          if (!current) return { success: false, retry: false, error: "Execution not found" };
          if (ExecutionStateMachine.isTerminal(current.status)) return { success: true };
          if (current.status !== "running") throw new Error(`Cannot claim execution in ${current.status}`);
          execution = current;
        }
      } else if (execution.status !== "running") {
        return { success: false, retry: false, error: `Execution is ${execution.status}` };
      }

      const acquired = await this.deps.userContextManager.acquireConcurrencySlot(
        context,
        this.deps.maxConcurrentPerUser,
      );
      if (!acquired) {
        await service.requeue(execution.id, new Error("Tenant concurrent execution limit reached"));
        await sessionRepository.update(execution.sessionId, {
          status: "queued",
          error: "Tenant concurrent execution limit reached",
        });
        return {
          success: false,
          retry: true,
          error: "Tenant concurrent execution limit reached",
        };
      }
      tenantAcquired = true;

      this.logInflight(execution.id, lane);

      const abortController = new AbortController();
      let polling = false;
      const poll = async () => {
        if (polling || abortController.signal.aborted) return;
        polling = true;
        try {
          const current = await repository.get(execution.id);
          if (!current) {
            abortController.abort(new Error("Execution disappeared during processing"));
            return;
          }
          if (current.status === "cancelled") {
            abortController.abort(new DOMException("Execution cancelled", "AbortError"));
          } else if (current.status === "timed_out") {
            const timeout = new Error("Execution timed out");
            timeout.name = "TimeoutError";
            abortController.abort(timeout);
          } else if (
            current.deadlineAt
            && Date.parse(current.deadlineAt) <= this.now().getTime()
            && current.status === "running"
          ) {
            await service.timeout(current.id, "Execution deadline exceeded");
            const timeout = new Error("Execution deadline exceeded");
            timeout.name = "TimeoutError";
            abortController.abort(timeout);
          }
        } finally {
          polling = false;
        }
      };
      const pollTimer = setInterval(() => {
        void poll();
      }, this.deps.pollIntervalMs);
      pollTimer.unref?.();

      this.activeExecutions.add(execution.id);
      let sawError = false;
      try {
        await sessionRepository.update(execution.sessionId, {
          status: "running",
          error: "",
        });
        await this.append(execution, {
          type: "execution_status",
          data: { status: "running", recovered: initialExecution.status === "running" },
        });

        const request = this.parseExecutePayload(execution.requestPayload);
        const tasks = await repository.listTasks(execution.id);
        const initialTaskResults = this.initialTaskResults(tasks);
        const resumePlan = this.parseTaskPlan(execution.planPayload);
        const sessionMeta = await sessionRepository.get(execution.sessionId);
        const executionOverrides = this.deps.executionOverridesFactory
          ? await this.deps.executionOverridesFactory(sessionMeta, context.userId)
          : undefined;
        const options: DirectorStreamOptions = {
          signal: abortController.signal,
          taskTimeoutMs: this.deps.taskTimeoutMs,
          resumePlan,
          initialTaskResults,
          executionId: execution.id,
          userId: context.userId,
          executionOverrides,
        };
        const attempts = new Map<string, ExecutionAttempt>();
        let completedOutput = "";
        let sawComplete = false;
        let sawCancelled = false;
        let sawHitl = false;

        for await (const event of this.director!.executeStream(
          request.requirement,
          execution.sessionId,
          request.mode,
          request.role,
          request.history,
          options,
        )) {
          await this.append(execution, event);
          if (event.type === "plan") {
            await this.persistPlan(repository, execution, event);
          } else if (event.type === "hitl") {
            sawHitl = true;
            const checkpoint = typeof event.data.reviewPoint === "string"
              ? event.data.reviewPoint
              : typeof event.data.checkpointId === "string"
                ? event.data.checkpointId
                : "";
            if (checkpoint && !hitlCheckpoints.includes(checkpoint)) {
              hitlCheckpoints.push(checkpoint);
            }
            await this.pauseForHitl(
              repository,
              sessionRepository,
              service,
              execution,
              event,
            );
          } else if (event.type === "task_start") {
            await this.startTask(repository, execution, event, attempts);
          } else if (event.type === "task_complete") {
            await this.completeTask(repository, execution, event, attempts);
          } else if (event.type === "complete") {
            sawComplete = true;
            completedOutput = typeof event.data.output === "string" ? event.data.output : "";
          } else if (event.type === "cancelled") {
            sawCancelled = true;
            completedOutput = typeof event.data.partialOutput === "string"
              ? event.data.partialOutput
              : completedOutput;
          } else if (event.type === "error") {
            sawError = true;
            const streamError = new Error(
              typeof event.data.error === "string" ? event.data.error : "Director execution failed",
            ) as Error & { errorClass?: unknown };
            streamError.errorClass = event.data.errorClass;
            throw streamError;
          }
        }

        const latest = await repository.get(execution.id);
        if (latest?.status === "cancelled" || latest?.status === "timed_out" || sawCancelled) {
          const partialOutput = completedOutput;
          await sessionRepository.update(execution.sessionId, {
            status: latest?.status === "timed_out" ? "timed_out" : "cancelled",
            output: partialOutput,
            error: latest?.errorMessage ?? "Execution cancelled",
          });
          if (latest) {
            await this.append(latest, {
              type: "execution_terminal",
              data: {
                status: latest.status === "timed_out" ? "timed_out" : "cancelled",
                partialOutput,
                error: latest.errorMessage,
              },
            });
            await this.append(latest, {
              type: "execution_outcome",
              data: {
                ...buildOutcomeSignal(
                  latest,
                  latest.status === "timed_out" ? "timed_out" : "cancelled",
                  {
                    attempts: message.retryCount,
                    hitlCheckpoints,
                    failReason: latest.errorClass ?? (latest.status === "timed_out" ? "timeout" : "cancelled"),
                  },
                ),
              },
            });
          }
          return { success: true };
        }
        if (sawHitl || latest?.status === "waiting_hitl") {
          return { success: true };
        }
        if (!sawComplete) {
          throw new Error("Director stream ended without a complete event");
        }

        const completed = await service.complete(execution.id, {
          resultPayload: { output: completedOutput },
        });
        await sessionRepository.update(execution.sessionId, {
          status: "completed",
          output: completedOutput,
          error: "",
        });
        await this.append(completed, {
          type: "execution_terminal",
          data: { status: "completed", output: completedOutput },
        });
        await this.append(completed, {
          type: "execution_outcome",
          data: { ...buildOutcomeSignal(completed, "success", {
            attempts: message.retryCount,
            hitlCheckpoints,
          }) },
        });
        return { success: true };
      } catch (error) {
        const current = await repository.get(execution.id);
        if (current?.status === "cancelled" || current?.status === "timed_out") {
          await sessionRepository.update(execution.sessionId, {
            status: current.status,
            error: current.errorMessage ?? ErrorClassifier.message(error),
          });
          await this.append(current, {
            type: "execution_terminal",
            data: { status: current.status, error: current.errorMessage },
          });
          await this.append(current, {
            type: "execution_outcome",
            data: {
              ...buildOutcomeSignal(
                current,
                current.status === "timed_out" ? "timed_out" : "cancelled",
                {
                  attempts: message.retryCount,
                  hitlCheckpoints,
                  failReason: current.errorClass ?? (current.status === "timed_out" ? "timeout" : "cancelled"),
                },
              ),
            },
          });
          return { success: true };
        }

        const errorClass = ErrorClassifier.classify(error);
        if (errorClass === "transient" && message.retryCount < message.maxRetries) {
          const requeued = await service.requeue(execution.id, error);
          await sessionRepository.update(execution.sessionId, {
            status: "queued",
            error: ErrorClassifier.message(error),
          });
          await this.append(requeued, {
            type: "execution_retry",
            data: {
              status: "queued",
              retryCount: message.retryCount + 1,
              error: ErrorClassifier.message(error),
            },
          });
          return { success: false, retry: true, error: ErrorClassifier.message(error) };
        }

        const failed = await service.fail(execution.id, error);
        const errorText = failed.errorMessage ?? ErrorClassifier.message(error);
        await sessionRepository.update(execution.sessionId, {
          status: failed.status === "cancelled" || failed.status === "timed_out"
            ? failed.status
            : "failed",
          error: errorText,
        });
        // Emit a first-class error event so SSE clients that only listen for `error`
        // (not `execution_terminal`) still surface an explicit failure message.
        // Skip if Director already yielded `error` (already appended above).
        if (!sawError) {
          await this.append(failed, {
            type: "error",
            data: {
              error: errorText,
              phase: "execution",
              errorClass: failed.errorClass,
              status: failed.status,
            },
          });
        }
        await this.append(failed, {
          type: "execution_terminal",
          data: {
            status: failed.status,
            errorClass: failed.errorClass,
            error: errorText,
          },
        });
        await this.append(failed, {
          type: "execution_outcome",
          data: { ...buildOutcomeSignal(failed, "failed", {
            attempts: message.retryCount,
            hitlCheckpoints,
            failReason: failed.errorClass,
          }) },
        });
        return { success: false, retry: false, error: ErrorClassifier.message(error) };
      } finally {
        clearInterval(pollTimer);
        this.activeExecutions.delete(execution.id);
      }
    } finally {
      this.deps.inflightLimiter.release(lane);
      if (tenantAcquired) {
        await this.deps.userContextManager.releaseConcurrencySlot(context);
      }
    }
  }

  private sleepDeferBackoff(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.deps.deferBackoffMs ?? 75);
      timer.unref?.();
    });
  }

  private resolveInflightLane(execution: Execution): InflightLane {
    const mode = execution.requestPayload.mode;
    if (mode === "design" || mode === "query" || mode === "table") {
      return mode;
    }
    return "query";
  }

  private logInflight(executionId: string, lane: InflightLane, reason?: string): void {
    const counts = this.deps.inflightLimiter.counts();
    const max = this.deps.inflightLimiter.maxCounts();
    const suffix = reason ? ` reason=${reason}` : "";
    console.log(
      `[ExecutionWorker] inflight query=${counts.query}/${max.query} design=${counts.design}/${max.design} execution=${executionId} mode=${lane}${suffix}`,
    );
  }

  private parsePayload(message: QueueMessage<unknown>): ExecutionQueuePayload {
    if (!message.userId) throw new Error("Queue message userId is required");
    if (typeof message.payload !== "object" || message.payload === null || Array.isArray(message.payload)) {
      throw new Error("Execution queue payload must be an object");
    }
    const record = message.payload as Record<string, unknown>;
    const keys = Object.keys(record);
    const allowed = new Set(["executionId", "userId", "mode"]);
    if (
      keys.length < 2
      || keys.length > 3
      || !keys.every((key) => allowed.has(key))
      || !("executionId" in record)
      || !("userId" in record)
    ) {
      throw new Error("Execution queue payload must contain only executionId, userId, and optional mode");
    }
    if (
      typeof record.executionId !== "string"
      || record.executionId.length === 0
      || typeof record.userId !== "string"
      || record.userId.length === 0
    ) {
      throw new Error("Execution queue payload fields must be non-empty strings");
    }
    if (record.userId !== message.userId) {
      throw new Error("Execution queue payload userId does not match message.userId");
    }
    if (!("mode" in record)) {
      return { executionId: record.executionId, userId: record.userId };
    }
    if (record.mode !== "design" && record.mode !== "query" && record.mode !== "table") {
      throw new Error("Execution queue payload mode must be design, query, or table");
    }
    return { executionId: record.executionId, userId: record.userId, mode: record.mode };
  }

  private parseExecutePayload(payload: Readonly<Record<string, unknown>>): ExecutePayload {
    const requirement = payload.requirement;
    const mode = payload.mode;
    const role = payload.role;
    if (
      typeof requirement !== "string"
      || requirement.trim().length === 0
      || !["design", "query", "table"].includes(String(mode))
      || typeof role !== "string"
      || role.length === 0
    ) {
      throw new Error("Persisted execution request payload is invalid");
    }
    const history = Array.isArray(payload.history)
      ? payload.history.filter(
        (item): item is { role: "user" | "assistant"; content: string } =>
          typeof item === "object"
          && item !== null
          && ["user", "assistant"].includes(String(Reflect.get(item, "role")))
          && typeof Reflect.get(item, "content") === "string",
      )
      : undefined;
    return {
      requirement,
      mode: mode as ExecutePayload["mode"],
      role,
      history,
    };
  }

  private parseTaskPlan(payload: Readonly<Record<string, unknown>> | undefined): TaskPlan | undefined {
    const candidate = payload?.plan ?? payload;
    if (
      typeof candidate !== "object"
      || candidate === null
      || typeof Reflect.get(candidate, "planId") !== "string"
      || typeof Reflect.get(candidate, "requirement") !== "string"
      || !Array.isArray(Reflect.get(candidate, "subTasks"))
    ) {
      return undefined;
    }
    return candidate as TaskPlan;
  }

  private initialTaskResults(tasks: ExecutionTask[]): TaskResult[] {
    return tasks
      .filter((task) => task.status === "success")
      .map((task) => ({
        taskId: task.taskKey,
        domain: (task.inputPayload.domain ?? "system_design") as TaskResult["domain"],
        status: "success",
        output: typeof task.outputPayload?.output === "string"
          ? task.outputPayload.output
          : "",
        errorMessage: null,
      }));
  }

  private async persistPlan(
    repository: ExecutionRepository,
    execution: Execution,
    event: StreamEvent,
  ): Promise<void> {
    const plan = this.parseTaskPlan(event.data);
    if (!plan) return;
    await repository.update(execution.id, { planPayload: { ...event.data } });
    await Promise.all(plan.subTasks.map((task, position) =>
      repository.createTask({
        id: this.deps.idGenerator.randomUUID(),
        executionId: execution.id,
        taskKey: task.id,
        name: task.description,
        dependencies: task.dependencies,
        inputPayload: { domain: task.domain, description: task.description },
        position,
      })
    ));
  }

  private async pauseForHitl(
    repository: ExecutionRepository,
    sessionRepository: SessionRepository,
    service: ExecutionService,
    execution: Execution,
    event: StreamEvent,
  ): Promise<void> {
    const plan = this.parseTaskPlan(event.data);
    if (plan) {
      await repository.update(execution.id, {
        planPayload: { plan, reviewPoint: event.data.reviewPoint },
      });
    }

    const checkpointId = typeof event.data.checkpointId === "string"
      ? event.data.checkpointId
      : undefined;
    const paused = await service.pause(execution.id, {
      resumeCursor: typeof event.data.resumeCursor === "string"
        ? event.data.resumeCursor
        : "after_plan",
      resumePayload: {
        checkpointId,
        reviewPoint: event.data.reviewPoint,
        status: event.data.status,
      },
    });
    await sessionRepository.update(execution.sessionId, {
      status: "waiting_hitl",
      hitlCheckpointId: checkpointId,
      error: "",
    });
    await this.append(paused, {
      type: "execution_status",
      data: {
        status: "waiting_hitl",
        checkpointId,
        reviewPoint: event.data.reviewPoint,
      },
    });
  }

  private async startTask(
    repository: ExecutionRepository,
    execution: Execution,
    event: StreamEvent,
    attempts: Map<string, ExecutionAttempt>,
  ): Promise<void> {
    const taskKey = this.eventTaskId(event);
    let task = (await repository.listTasks(execution.id)).find((item) => item.taskKey === taskKey);
    if (!task) {
      task = (await repository.createTask({
        id: this.deps.idGenerator.randomUUID(),
        executionId: execution.id,
        taskKey,
        name: typeof event.data.description === "string" ? event.data.description : taskKey,
        agentName: typeof event.data.agentName === "string" ? event.data.agentName : undefined,
        inputPayload: { ...event.data },
      })).entity;
    }
    if (task.status === "pending") {
      task = await repository.transitionTaskStatus(
        task.id,
        "pending",
        "running",
        { startedAt: this.now().toISOString() },
      ) ?? task;
    }
    if (task.status !== "running") return;

    const previousAttempts = await repository.listAttempts(task.id);
    await Promise.all(previousAttempts
      .filter((attempt) => attempt.status === "running")
      .map((attempt) => repository.completeAttempt(attempt.id, {
        status: "error",
        errorClass: "transient",
        errorMessage: "Worker recovered an unfinished attempt",
        finishedAt: this.now().toISOString(),
      })));
    const attemptNumber = previousAttempts.reduce(
      (max, attempt) => Math.max(max, attempt.attemptNumber),
      0,
    ) + 1;
    const attempt = (await repository.createAttempt({
      id: this.deps.idGenerator.randomUUID(),
      executionId: execution.id,
      taskId: task.id,
      attemptNumber,
      inputPayload: { ...event.data },
      startedAt: this.now().toISOString(),
    })).entity;
    attempts.set(taskKey, attempt);
  }

  private async completeTask(
    repository: ExecutionRepository,
    execution: Execution,
    event: StreamEvent,
    attempts: Map<string, ExecutionAttempt>,
  ): Promise<void> {
    const taskKey = this.eventTaskId(event);
    const task = (await repository.listTasks(execution.id)).find((item) => item.taskKey === taskKey);
    if (!task || ["success", "error", "skipped", "cancelled"].includes(task.status)) return;
    const rawStatus = typeof event.data.status === "string" ? event.data.status : "error";
    const nextStatus: ExecutionTaskStatus = rawStatus === "success"
      ? "success"
      : rawStatus === "skipped"
        ? "skipped"
        : rawStatus === "cancelled"
          ? "cancelled"
          : "error";
    const output = typeof event.data.output === "string" ? event.data.output : "";
    const errorMessage = typeof event.data.errorMessage === "string"
      ? event.data.errorMessage
      : undefined;
    const explicitErrorClass = event.data.errorClass;
    const taskErrorClass = ["transient", "permanent", "cancelled", "timeout"]
      .includes(String(explicitErrorClass))
      ? explicitErrorClass as "transient" | "permanent" | "cancelled" | "timeout"
      : errorMessage === undefined
        ? undefined
        : ErrorClassifier.classify(errorMessage);
    const expected = task.status === "running" ? "running" : "pending";
    await repository.transitionTaskStatus(task.id, expected, nextStatus, {
      outputPayload: { output },
      errorClass: nextStatus === "cancelled"
        ? "cancelled"
        : nextStatus === "error"
          ? (taskErrorClass ?? "permanent")
          : null,
      errorMessage: errorMessage ?? null,
      completedAt: this.now().toISOString(),
    });
    const attempt = attempts.get(taskKey);
    if (attempt) {
      await repository.completeAttempt(attempt.id, {
        status: nextStatus === "success"
          ? "success"
          : nextStatus === "cancelled"
            ? "cancelled"
            : taskErrorClass === "timeout"
              ? "timed_out"
              : "error",
        errorClass: nextStatus === "cancelled"
          ? "cancelled"
          : nextStatus === "error"
            ? (taskErrorClass ?? "permanent")
            : null,
        errorMessage: errorMessage ?? null,
        outputPayload: { output },
        finishedAt: this.now().toISOString(),
      });
    }
  }

  private eventTaskId(event: StreamEvent): string {
    if (typeof event.data.taskId !== "string" || event.data.taskId.length === 0) {
      throw new Error(`${event.type} event is missing taskId`);
    }
    return event.data.taskId;
  }

  private append(
    execution: Pick<Execution, "userId" | "id">,
    event: { type: string; data: Record<string, unknown> },
  ): Promise<unknown> {
    return this.deps.eventStore.append(execution.userId, execution.id, {
      type: event.type,
      data: event.data,
      createdAt: this.now().toISOString(),
    });
  }
}
