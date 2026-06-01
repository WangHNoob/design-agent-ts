import { AsyncLocalStorage } from "node:async_hooks";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";

export class NodeContextStorageAdapter<T> implements ContextStoragePort<T> {
  private storage = new AsyncLocalStorage<T>();

  run<R>(store: T, callback: () => R): R {
    return this.storage.run(store, callback);
  }

  getStore(): T | undefined {
    return this.storage.getStore();
  }
}
