import type { LogReporter, BatchLogIn, LogOut } from "../../port/o11y/LogReporter.js";

export class HttpLogReporter implements LogReporter {
  constructor(private baseUrl: string) {}

  async batchCreateLogs(batch: BatchLogIn): Promise<{ status: string; count: number }> {
    const res = await fetch(`${this.baseUrl}/api/v1/logs/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`batchCreateLogs failed: ${res.status}`);
    return res.json() as Promise<{ status: string; count: number }>;
  }

  async getLogsBySession(
    sessionId: string,
    options?: { level?: string; limit?: number; offset?: number }
  ): Promise<LogOut[]> {
    const params = new URLSearchParams();
    if (options?.level) params.set("level", options.level);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const qs = params.toString();
    const res = await fetch(`${this.baseUrl}/api/v1/logs/session/${sessionId}${qs ? "?" + qs : ""}`);
    if (!res.ok) throw new Error(`getLogsBySession failed: ${res.status}`);
    return res.json() as Promise<LogOut[]>;
  }
}
