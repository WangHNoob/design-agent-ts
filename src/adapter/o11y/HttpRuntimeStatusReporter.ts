import type { RuntimeStatusReporter, RuntimeStatusCreate } from "../../port/o11y/RuntimeStatusReporter.js";

export class HttpRuntimeStatusReporter implements RuntimeStatusReporter {
  constructor(private baseUrl: string) {}

  async postRuntimeStatus(status: RuntimeStatusCreate): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/runtime/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(status),
    });
    if (!res.ok) throw new Error(`postRuntimeStatus failed: ${res.status}`);
    return res.json() as Promise<{ status: string }>;
  }
}
