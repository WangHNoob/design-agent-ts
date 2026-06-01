import type { LogReporter, LogCreate, BatchLogIn } from "../../port/o11y/LogReporter.js";

export class BatchLogReporter implements LogReporter {
  private queue: LogCreate[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private delegate: LogReporter,
    private flushIntervalMs: number = 1000,
    private batchSize: number = 100
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  async batchCreateLogs(batch: BatchLogIn): Promise<{ status: string; count: number }> {
    this.queue.push(...batch.logs);
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
    return { status: "accepted", count: batch.logs.length };
  }

  async getLogsBySession(sessionId: string, options?: { level?: string; limit?: number; offset?: number }) {
    return this.delegate.getLogsBySession(sessionId, options);
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await this.delegate.batchCreateLogs({ logs: batch });
    } catch {
      try {
        await this.delegate.batchCreateLogs({ logs: batch });
      } catch {
        // Drop after retry
      }
    }
  }
}
