import { CircuitBreaker, type CircuitBreakerOptions } from "./CircuitBreaker.js";

/**
 * Per-tool-name circuit breakers so wrappers sharing a logical tool
 * (or re-created wrappers) share failure state.
 */
export class ToolCircuitRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  get(toolName: string): CircuitBreaker {
    let breaker = this.breakers.get(toolName);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options);
      this.breakers.set(toolName, breaker);
    }
    return breaker;
  }

  /** Test / ops helper. */
  getState(toolName: string): ReturnType<CircuitBreaker["getState"]> | undefined {
    return this.breakers.get(toolName)?.getState();
  }
}
