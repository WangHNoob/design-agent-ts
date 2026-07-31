import type { SpanRecord, TraceRecord } from "./types.js";

/**
 * Pluggable export sink (OTel Collector, logging, etc.).
 * A1 ships a NoOp + optional Console exporter; real OTLP comes later.
 */
export interface TraceExporter {
  exportSpans(spans: readonly SpanRecord[]): Promise<void>;
  exportTrace?(trace: TraceRecord): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export class NoOpTraceExporter implements TraceExporter {
  async exportSpans(_spans: readonly SpanRecord[]): Promise<void> {}
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
