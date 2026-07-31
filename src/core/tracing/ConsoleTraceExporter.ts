import type { TraceExporter } from "../../port/tracing/TraceExporter.js";
import type { SpanRecord, TraceRecord } from "../../port/tracing/types.js";

/** Dev-aid exporter: logs completed spans to stdout. */
export class ConsoleTraceExporter implements TraceExporter {
  async exportSpans(spans: readonly SpanRecord[]): Promise<void> {
    for (const span of spans) {
      const phase = span.phase ? ` phase=${span.phase}` : "";
      console.log(
        `[Trace] span=${span.name}${phase} status=${span.status} trace=${span.traceId} parent=${span.parentSpanId ?? "-"}`,
      );
    }
  }

  async exportTrace(trace: TraceRecord): Promise<void> {
    console.log(`[Trace] end trace=${trace.id} name=${trace.name} status=${trace.status}`);
  }

  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
