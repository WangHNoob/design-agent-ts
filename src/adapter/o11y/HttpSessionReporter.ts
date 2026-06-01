import type { SessionReporter, SessionCreate, SessionOut, SessionMetrics } from "../../port/o11y/SessionReporter.js";

export class HttpSessionReporter implements SessionReporter {
  constructor(private baseUrl: string) {}

  async createSession(session: SessionCreate): Promise<SessionOut> {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
    return res.json() as Promise<SessionOut>;
  }

  async getSession(sessionId: string): Promise<SessionOut | null> {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
    return res.json() as Promise<SessionOut>;
  }

  async listSessions(options?: { skip?: number; limit?: number }): Promise<SessionOut[]> {
    const params = new URLSearchParams();
    if (options?.skip !== undefined) params.set("skip", String(options.skip));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    const qs = params.toString();
    const res = await fetch(`${this.baseUrl}/api/v1/sessions${qs ? "?" + qs : ""}`);
    if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
    return res.json() as Promise<SessionOut[]>;
  }

  async getSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
    const res = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/metrics`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getSessionMetrics failed: ${res.status}`);
    return res.json() as Promise<SessionMetrics>;
  }
}
