import type { AgentPort } from "../../port/agent/AgentPort.js";
import { AgentResponse } from "../../port/agent/AgentResponse.js";
import type { TraceStorePort } from "../../port/tracing/TraceStorePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { EvalStorePort } from "../../port/eval/EvalStorePort.js";
import type { ScorerPort } from "../../port/eval/ScorerPort.js";
import type {
  EvalCase,
  EvalDataset,
  EvalMode,
  EvalReport,
  EvalScore,
  EvalTask,
} from "../../port/eval/types.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";

export interface EvalRunnerOptions {
  readonly store: EvalStorePort;
  readonly scorers: readonly ScorerPort[];
  readonly ids: IdGeneratorPort;
  /** Required for online mode. */
  readonly agent?: AgentPort;
  /** Optional: resolve recorded output from Trace when case has sourceTraceId. */
  readonly traceStore?: TraceStorePort;
  /** Default userId for Trace lookups when case.sourceUserId is absent. */
  readonly defaultUserId?: string;
}

export interface RunEvalInput {
  readonly dataset: EvalDataset;
  readonly mode: EvalMode;
  /** Limit to specific case ids (optional). */
  readonly caseIds?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Eval pipeline: load dataset → (online: call Agent | offline: use Trace/recorded) → score → report.
 */
export class EvalRunner {
  constructor(private readonly options: EvalRunnerOptions) {}

  async run(input: RunEvalInput): Promise<EvalReport> {
    const taskId = this.options.ids.randomUUID();
    const now = new Date().toISOString();
    let task: EvalTask = {
      id: taskId,
      datasetId: input.dataset.id,
      mode: input.mode,
      status: "running",
      createdAt: now,
      attributes: input.attributes,
    };
    await this.options.store.createTask(task);

    try {
      const cases = input.caseIds
        ? input.dataset.cases.filter((c) => input.caseIds!.includes(c.id))
        : [...input.dataset.cases];

      for (const evalCase of cases) {
        const { actualOutput, traceId } = await this.resolveOutput(input.mode, evalCase);
        for (const metric of input.dataset.metrics) {
          const scorer = this.options.scorers.find((s) => s.kind === metric.kind);
          if (!scorer) {
            throw new Error(`No scorer registered for metric kind: ${metric.kind}`);
          }
          const baseline = input.dataset.baselines.find(
            (b) => b.caseId === evalCase.id && b.metricId === metric.id,
          );
          // A metric only applies to a case when a baseline defines its
          // expectation — otherwise unrelated metrics would produce noise.
          if (!baseline) continue;
          const result = await scorer.score({
            case: evalCase,
            metric,
            baseline,
            actualOutput,
            traceId,
          });
          const score: EvalScore = {
            id: this.options.ids.randomUUID(),
            taskId,
            caseId: evalCase.id,
            metricId: metric.id,
            score: result.score,
            passed: result.passed,
            rationale: result.rationale,
            traceId,
            actualOutput,
            createdAt: new Date().toISOString(),
          };
          await this.options.store.appendScore(score);
        }
      }

      task = (await this.options.store.updateTask(taskId, {
        status: "completed",
        completedAt: new Date().toISOString(),
      }))!;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.options.store.updateTask(taskId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: message,
      });
      throw err;
    }

    const report = await this.options.store.getReport(taskId);
    if (!report) throw new Error(`Eval report missing for task ${taskId}`);
    return report;
  }

  private async resolveOutput(
    mode: EvalMode,
    evalCase: EvalCase,
  ): Promise<{ actualOutput: string; traceId?: string }> {
    if (mode === "offline") {
      if (evalCase.recordedOutput !== undefined) {
        return {
          actualOutput: evalCase.recordedOutput,
          traceId: evalCase.sourceTraceId,
        };
      }
      if (evalCase.sourceTraceId && this.options.traceStore) {
        const userId = evalCase.sourceUserId ?? this.options.defaultUserId;
        if (!userId) {
          throw new Error(
            `Offline case "${evalCase.id}" has sourceTraceId but no sourceUserId/defaultUserId`,
          );
        }
        const detail = await this.options.traceStore.getTrace(userId, evalCase.sourceTraceId);
        if (!detail) {
          throw new Error(`Trace not found for offline case "${evalCase.id}": ${evalCase.sourceTraceId}`);
        }
        const output = extractOutputFromTrace(detail.trace.attributes, detail.spans.map((s) => s.attributes));
        if (!output) {
          throw new Error(`No output found on Trace ${evalCase.sourceTraceId} for case "${evalCase.id}"`);
        }
        return { actualOutput: output, traceId: evalCase.sourceTraceId };
      }
      throw new Error(
        `Offline case "${evalCase.id}" needs recordedOutput or sourceTraceId+TraceStore`,
      );
    }

    // online
    const agent = this.options.agent;
    if (!agent) {
      throw new Error("Online eval requires an AgentPort");
    }
    const sessionId = `eval-${evalCase.id}-${this.options.ids.randomUUID().slice(0, 8)}`;
    const response = await agent.process(sessionId, [
      ChatMessage.text("user", "eval-user", evalCase.input),
    ]);
    if (!response.success) {
      throw new Error(
        `Online agent failed for case "${evalCase.id}": ${response.errorMessage ?? "unknown"}`,
      );
    }
    const actualOutput =
      AgentResponse.getTextContent(response) ??
      (response.errorMessage ? `ERROR: ${response.errorMessage}` : "");
    const traceId =
      typeof response.metadata.traceId === "string" ? response.metadata.traceId : undefined;
    return { actualOutput, traceId };
  }
}

function extractOutputFromTrace(
  traceAttrs: Readonly<Record<string, unknown>>,
  spanAttrsList: ReadonlyArray<Readonly<Record<string, unknown>>>,
): string | null {
  const fromTrace =
    asString(traceAttrs["eval.output"]) ??
    asString(traceAttrs["output"]) ??
    asString(traceAttrs["final_output"]);
  if (fromTrace) return fromTrace;

  for (const attrs of spanAttrsList) {
    const candidate =
      asString(attrs["eval.output"]) ??
      asString(attrs["agent.output"]) ??
      asString(attrs["output"]);
    if (candidate) return candidate;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
