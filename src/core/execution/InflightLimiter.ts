export type InflightLane = "query" | "design" | "table";

export interface InflightLimiterOptions {
  readonly query: number;
  readonly design: number;
}

export class InflightLimiter {
  private readonly max: { query: number; design: number };
  private readonly used = { query: 0, design: 0 };

  constructor(options: InflightLimiterOptions) {
    this.max = {
      query: Math.max(1, Math.trunc(options.query)),
      design: Math.max(1, Math.trunc(options.design)),
    };
  }

  private resolve(lane: InflightLane): "query" | "design" {
    // design + table share the heavy lane; only query uses QUERY_MAX_INFLIGHT
    return lane === "query" ? "query" : "design";
  }

  tryAcquire(lane: InflightLane): boolean {
    const key = this.resolve(lane);
    if (this.used[key] >= this.max[key]) return false;
    this.used[key] += 1;
    return true;
  }

  release(lane: InflightLane): void {
    const key = this.resolve(lane);
    if (this.used[key] <= 0) return;
    this.used[key] -= 1;
  }

  counts(): Readonly<{ query: number; design: number }> {
    return { query: this.used.query, design: this.used.design };
  }

  maxCounts(): Readonly<{ query: number; design: number }> {
    return { ...this.max };
  }
}
