import type { TaskPlan, SubTask } from "../schema/TaskPlan.js";
import type { TaskResult } from "../schema/TaskResult.js";
import { ErrorClassifier } from "../execution/ErrorClassifier.js";
import { isToolHitlRequiredError } from "../tool/ToolHitlRequiredError.js";
import { PlanHardGuard } from "../plan/PlanHardGuard.js";
import { isPlanViolationError } from "../plan/PlanViolationError.js";
import { runFanOutBatches, type FanOutBatchInfo } from "../multiagent/FanOutLimiter.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";

export type TaskExecutor = (task: SubTask, signal?: AbortSignal) => Promise<TaskResult>;

export interface PlanPipelineOptions {
  signal?: AbortSignal;
  taskTimeoutMs?: number;
  initialResults?: readonly TaskResult[];
  onTaskStart?: (task: SubTask) => void | Promise<void>;
  onTaskResult?: (task: SubTask, result: TaskResult) => void | Promise<void>;
  /**
   * When true (default), assertExecutable rejects jump-ahead before calling executor.
   * Failed-deps → skipped path is unchanged.
   */
  planHardEnabled?: boolean;
  /**
   * Max concurrent tasks per DAG layer. When layer size exceeds this, tasks are
   * executed in ordered batches via Promise.all. 0 / undefined = unlimited.
   */
  maxFanOut?: number;
  /** Audit callback when a fan-out layer is split into batches. */
  onFanOutBatch?: (info: FanOutBatchInfo) => void | Promise<void>;
  /** Grace period to collect partial output from an aborted in-flight task (ms). Default 2000. */
  inFlightPartialOutputTimeoutMs?: number;
}

class TaskTimeoutError extends Error {
  constructor(taskId: string, timeoutMs: number) {
    super(`Task ${taskId} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class PlanPipeline {
  private layers: string[][];
  private signal?: AbortSignal;
  private options: Omit<PlanPipelineOptions, "signal">;

  private readonly logger: LoggerPort;

  constructor(
    private plan: TaskPlan,
    private executor: TaskExecutor,
    signalOrOptions?: AbortSignal | PlanPipelineOptions,
    options: Omit<PlanPipelineOptions, "signal"> = {},
    logger?: LoggerPort,
  ) {
    this.logger = logger ?? new ConsoleLogger();
    if (this.isAbortSignal(signalOrOptions)) {
      this.signal = signalOrOptions;
      this.options = options;
    } else {
      this.signal = signalOrOptions?.signal;
      this.options = signalOrOptions ?? options;
    }
    this.layers = this.topologicalSort(plan);
  }

  async execute(): Promise<TaskResult[]> {
    const initialResults = this.options.initialResults ?? [];
    const allResults: TaskResult[] = [...initialResults];
    const resultByTaskId = new Map(initialResults.map((result) => [result.taskId, result]));

    for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex += 1) {
      const layer = this.layers[layerIndex] ?? [];
      // Check abort between layers
      if (this.signal?.aborted) {
        const remainingLayers = this.layers.length - layerIndex;
        const remainingTasks = this.plan.subTasks.length - resultByTaskId.size;
        this.logger.info(
          `[PlanPipeline] Aborted, cancelling ${remainingTasks} tasks across ${remainingLayers} layers`,
        );
        await this.appendCancelledResults(allResults, resultByTaskId);
        return allResults;
      }

      const layerTasks = layer
        .map((id) => this.plan.subTasks.find((t) => t.id === id))
        .filter((t): t is SubTask => t !== undefined)
        .filter((task) => !resultByTaskId.has(task.id));

      const runBatch = (batch: readonly SubTask[]) =>
        Promise.all(
          batch.map(async (task) => {
            const failedDependencies = task.dependencies.filter(
              (dependencyId) => resultByTaskId.get(dependencyId)?.status !== "success",
            );
            if (failedDependencies.length > 0) {
              const result = this.skippedResult(task, failedDependencies);
              await this.options.onTaskResult?.(task, result);
              return result;
            }
            return this.executeTask(task, resultByTaskId);
          }),
        );

      const maxFanOut = this.options.maxFanOut ?? 0;
      const layerResults = await runFanOutBatches(
        layerTasks,
        maxFanOut,
        runBatch,
        this.options.onFanOutBatch,
      );

      for (const result of layerResults) {
        allResults.push(result);
        resultByTaskId.set(result.taskId, result);
      }
    }

    return allResults;
  }

  getLayers(): string[][] {
    return this.layers;
  }

  private topologicalSort(plan: TaskPlan): string[][] {
    const taskIds = new Set<string>();
    for (const task of plan.subTasks) {
      if (taskIds.has(task.id)) {
        throw new Error(`Duplicate task id in task plan: ${task.id}`);
      }
      taskIds.add(task.id);
    }
    for (const task of plan.subTasks) {
      const unknownDependencies = task.dependencies.filter((dependency) => !taskIds.has(dependency));
      if (unknownDependencies.length > 0) {
        throw new Error(
          `Task ${task.id} has unknown dependencies: ${unknownDependencies.join(", ")}`,
        );
      }
    }

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of plan.subTasks) {
      inDegree.set(task.id, task.dependencies.length);
      for (const dep of task.dependencies) {
        const list = adjacency.get(dep) ?? [];
        list.push(task.id);
        adjacency.set(dep, list);
      }
    }

    const layers: string[][] = [];
    let queue = plan.subTasks
      .filter((t) => t.dependencies.length === 0)
      .map((t) => t.id);
    let totalProcessed = 0;

    while (queue.length > 0) {
      layers.push([...queue]);
      totalProcessed += queue.length;
      const nextQueue: string[] = [];
      for (const id of queue) {
        for (const neighbor of adjacency.get(id) ?? []) {
          const deg = (inDegree.get(neighbor) ?? 0) - 1;
          inDegree.set(neighbor, deg);
          if (deg === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    // Cycle detection: if not all tasks were processed, there is a dependency cycle
    if (totalProcessed !== plan.subTasks.length) {
      const remaining = plan.subTasks
        .filter((t) => !layers.flat().includes(t.id))
        .map((t) => t.id);
      throw new Error(
        `Dependency cycle detected in task plan. Remaining tasks: ${remaining.join(", ")}`
      );
    }

    return layers;
  }

  private async executeTask(
    task: SubTask,
    resultByTaskId: Map<string, TaskResult>,
  ): Promise<TaskResult> {
    const planHardEnabled = this.options.planHardEnabled !== false;
    if (planHardEnabled) {
      const completedSuccessIds = new Set(
        [...resultByTaskId.entries()]
          .filter(([, result]) => result.status === "success")
          .map(([id]) => id),
      );
      try {
        PlanHardGuard.assertExecutable(task, completedSuccessIds);
      } catch (err) {
        if (isPlanViolationError(err)) {
          const result: TaskResult = {
            taskId: task.id,
            domain: task.domain,
            status: "error",
            output: "",
            errorMessage: err instanceof Error ? err.message : String(err),
            errorClass: "permanent",
          };
          await this.options.onTaskResult?.(task, result);
          return result;
        }
        throw err;
      }
    }

    await this.options.onTaskStart?.(task);

    const controller = new AbortController();
    const abortFromRoot = () => controller.abort(this.signal?.reason);
    if (this.signal?.aborted) {
      abortFromRoot();
    } else {
      this.signal?.addEventListener("abort", abortFromRoot, { once: true });
    }

    const timeoutMs = this.options.taskTimeoutMs;
    const timeout = timeoutMs !== undefined && timeoutMs > 0
      ? setTimeout(
        () => controller.abort(new TaskTimeoutError(task.id, timeoutMs)),
        timeoutMs,
      )
      : undefined;

    let result: TaskResult;
    const execution = Promise.resolve().then(() => this.executor(task, controller.signal));
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        const rejectForAbort = () => reject(
          controller.signal.reason ?? new DOMException("Task aborted", "AbortError"),
        );
        if (controller.signal.aborted) {
          rejectForAbort();
        } else {
          controller.signal.addEventListener("abort", rejectForAbort, { once: true });
        }
      });
      result = await Promise.race([execution, aborted]);
    } catch (error) {
      if (isToolHitlRequiredError(error)) {
        throw error;
      }
      const recovered = await this.tryRecoverInFlightResult(execution);
      if (recovered) {
        result = recovered;
      } else {
        const errorClass = this.signal?.aborted
          ? "cancelled"
          : ErrorClassifier.classify(error);
        result = {
          taskId: task.id,
          domain: task.domain,
          status: errorClass === "cancelled" ? "cancelled" : "error",
          output: "",
          errorMessage: ErrorClassifier.message(error),
          errorClass,
        };
      }
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      this.signal?.removeEventListener("abort", abortFromRoot);
    }

    await this.options.onTaskResult?.(task, result);
    return result;
  }

  private skippedResult(task: SubTask, failedDependencies: string[]): TaskResult {
    return {
      taskId: task.id,
      domain: task.domain,
      status: "skipped",
      output: "",
      errorMessage: `Skipped because dependencies did not succeed: ${failedDependencies.join(", ")}`,
    };
  }

  private async tryRecoverInFlightResult(
    execution: Promise<TaskResult>,
  ): Promise<TaskResult | null> {
    const graceMs = this.options.inFlightPartialOutputTimeoutMs ?? 2000;
    try {
      const resolved = await Promise.race([
        execution,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs)),
      ]);
      if (!resolved) {
        return null;
      }
      if (resolved.status === "cancelled" || this.signal?.aborted) {
        return {
          ...resolved,
          status: "cancelled",
          errorClass: "cancelled",
          errorMessage: resolved.errorMessage ?? "Cancelled by user",
        };
      }
    } catch {
      // In-flight executor rejected after abort — no recoverable partial result.
    }
    return null;
  }

  private async appendCancelledResults(
    allResults: TaskResult[],
    resultByTaskId: Map<string, TaskResult>,
  ): Promise<void> {
    for (const task of this.plan.subTasks) {
      if (resultByTaskId.has(task.id)) {
        continue;
      }
      const result: TaskResult = {
        taskId: task.id,
        domain: task.domain,
        status: "cancelled",
        output: "",
        errorMessage: "Cancelled by user",
      };
      allResults.push(result);
      resultByTaskId.set(task.id, result);
      await this.options.onTaskResult?.(task, result);
    }
  }

  private isAbortSignal(
    value: AbortSignal | PlanPipelineOptions | undefined,
  ): value is AbortSignal {
    return value !== undefined
      && "aborted" in value
      && typeof value.addEventListener === "function";
  }
}
