export interface ContextStoragePort<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
  /**
   * Optionally bind store for the current async resource (Node ALS enterWith).
   * Used by streaming paths where the generator is iterated outside `run()`.
   */
  enterWith?(store: T): void;
}
