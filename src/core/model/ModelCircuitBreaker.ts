export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}

/**
 * Per-model-slot circuit breaker (Closed → Open → Half-Open).
 */
export class ModelCircuitBreaker {
  private failures = 0;
  private state: CircuitState = "closed";
  private openedAt = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  getState(): CircuitState {
    this.refresh();
    return this.state;
  }

  /** Whether this slot may receive traffic. */
  allow(): boolean {
    this.refresh();
    return this.state !== "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }

  private refresh(): void {
    if (this.state === "open" && this.now() - this.openedAt >= this.options.cooldownMs) {
      this.state = "half_open";
    }
  }
}
