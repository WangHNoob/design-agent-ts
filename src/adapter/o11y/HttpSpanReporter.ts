import type { SpanReporter, BatchSpanIn, SpanOut } from "../../port/o11y/SpanReporter.js";

export class HttpSpanReporter implements SpanReporter {
  constructor(private baseUrl: string) {}

  async batchCreateSpans(batch: BatchSpanIn): Promise<{ received: number }> {
    const res = await fetch(`${this.baseUrl}/api/v1/spans/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`batchCreateSpans failed: ${res.status}`);
    return res.json() as Promise<{ received: number }>;
  }

  async getSpansByTrace(traceId: string): Promise<SpanOut[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/spans/trace/${traceId}`);
    if (!res.ok) throw new Error(`getSpansByTrace failed: ${res.status}`);
    return res.json() as Promise<SpanOut[]>;
  }
}
