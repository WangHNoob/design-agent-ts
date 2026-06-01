import type { SpanReporter, SpanCreate, BatchSpanIn } from "../../port/o11y/SpanReporter.js";

export class BatchSpanReporter implements SpanReporter {
  private queue: SpanCreate[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private delegate: SpanReporter,
    private flushIntervalMs: number = 1000,
    private batchSize: number = 50
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

  async batchCreateSpans(batch: BatchSpanIn): Promise<{ received: number }> {
    this.queue.push(...batch.spans);
    if (this.queue.length >= this.batchSize) {
      await this.flush();
    }
    return { received: batch.spans.length };
  }

  async getSpansByTrace(traceId: string) {
    return this.delegate.getSpansByTrace(traceId);
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await this.delegate.batchCreateSpans({ spans: batch });
    } catch {
      // Retry once
      try {
        await this.delegate.batchCreateSpans({ spans: batch });
      } catch {
        // Drop after retry; could log to local file in future
      }
    }
  }
}
