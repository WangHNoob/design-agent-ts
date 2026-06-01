import type { TraceReporter, TraceCreate, TraceOut } from "../../port/o11y/TraceReporter.js";

export class HttpTraceReporter implements TraceReporter {
  constructor(private baseUrl: string) {}

  async createTrace(trace: TraceCreate): Promise<TraceOut> {
    const res = await fetch(`${this.baseUrl}/api/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trace),
    });
    if (!res.ok) throw new Error(`createTrace failed: ${res.status}`);
    return res.json() as Promise<TraceOut>;
  }

  async getTrace(traceId: string): Promise<TraceOut | null> {
    const res = await fetch(`${this.baseUrl}/api/v1/traces/${traceId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getTrace failed: ${res.status}`);
    return res.json() as Promise<TraceOut>;
  }

  async getTracesBySession(sessionId: string): Promise<TraceOut[]> {
    const res = await fetch(`${this.baseUrl}/api/v1/traces/session/${sessionId}`);
    if (!res.ok) throw new Error(`getTracesBySession failed: ${res.status}`);
    return res.json() as Promise<TraceOut[]>;
  }
}
