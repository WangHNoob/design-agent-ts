import type { CompensateHandler } from "../../port/tool/ToolCompensate.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import type {
  CompensateFailureQueuePort,
  CompensateFailureRecord,
} from "../../port/saga/CompensateFailureQueuePort.js";

export interface SagaJournalEntry {
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly forwardResult: ToolResult;
  readonly handler: CompensateHandler;
  readonly order: number;
}

export interface SagaCompensateResult {
  readonly toolName: string;
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly queued?: boolean;
}

export interface SagaCompensateSummary {
  readonly reason: string;
  readonly results: readonly SagaCompensateResult[];
  readonly allSucceeded: boolean;
}

export interface SagaCoordinatorOptions {
  readonly enabled: boolean;
  readonly sessionId?: string;
  readonly agentName?: string;
  readonly failureQueue?: CompensateFailureQueuePort;
}

export class SagaCoordinator {
  private readonly entries: SagaJournalEntry[] = [];
  private orderCounter = 0;

  constructor(private readonly options: SagaCoordinatorOptions) {}

  get enabled(): boolean {
    return this.options.enabled;
  }

  register(
    toolName: string,
    args: Record<string, unknown>,
    forwardResult: ToolResult,
    handler: CompensateHandler,
  ): void {
    if (!this.options.enabled) return;
    this.entries.push({
      toolName,
      args,
      forwardResult,
      handler,
      order: this.orderCounter++,
    });
  }

  /** Commit successful saga — drop journal without compensating. */
  clear(): void {
    this.entries.length = 0;
    this.orderCounter = 0;
  }

  getJournalSize(): number {
    return this.entries.length;
  }

  getJournal(): readonly SagaJournalEntry[] {
    return this.entries;
  }

  async compensateAll(reason: string): Promise<SagaCompensateSummary> {
    if (!this.options.enabled || this.entries.length === 0) {
      return { reason, results: [], allSucceeded: true };
    }

    const reversed = [...this.entries].reverse();
    const results: SagaCompensateResult[] = [];

    for (const entry of reversed) {
      const context = {
        sessionId: this.options.sessionId,
        agentName: this.options.agentName,
        toolName: entry.toolName,
      };
      try {
        const result = await entry.handler.compensate(
          { ...entry.args },
          entry.forwardResult,
          context,
        );
        if (result.isError) {
          const onFailure = entry.handler.onCompensateFailure ?? "queue";
          const queued = onFailure === "queue"
            ? await this.queueFailure(entry, reason, result.output)
            : false;
          results.push({
            toolName: entry.toolName,
            success: false,
            error: result.output,
            queued,
          });
        } else {
          results.push({
            toolName: entry.toolName,
            success: true,
            output: result.output,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const onFailure = entry.handler.onCompensateFailure ?? "queue";
        const queued = onFailure === "queue"
          ? await this.queueFailure(entry, reason, message)
          : false;
        results.push({
          toolName: entry.toolName,
          success: false,
          error: message,
          queued,
        });
      }
    }

    this.clear();
    return {
      reason,
      results,
      allSucceeded: results.every((item) => item.success),
    };
  }

  private async queueFailure(
    entry: SagaJournalEntry,
    reason: string,
    compensateError: string,
  ): Promise<boolean> {
    const queue = this.options.failureQueue;
    if (!queue) return false;
    const record: CompensateFailureRecord = {
      toolName: entry.toolName,
      args: entry.args,
      forwardResult: entry.forwardResult,
      compensateError,
      reason,
      sessionId: this.options.sessionId,
      agentName: this.options.agentName,
      createdAt: new Date().toISOString(),
    };
    await queue.enqueue(record);
    return true;
  }
}
