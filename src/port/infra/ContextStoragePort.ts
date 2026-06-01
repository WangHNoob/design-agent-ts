export interface ContextStoragePort<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
}
