import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";

export interface O11yContext {
  traceId: string;
  spanId: string;
  sessionId: string;
}

let contextStorage: ContextStoragePort<O11yContext> | null = null;

export function configureContextStorage(storage: ContextStoragePort<O11yContext>): void {
  contextStorage = storage;
}

function getStorage(): ContextStoragePort<O11yContext> {
  if (!contextStorage) {
    throw new Error("ContextStorage not configured. Call configureContextStorage() during bootstrap.");
  }
  return contextStorage;
}

export function runInContext<T>(ctx: O11yContext, fn: () => T): T {
  return getStorage().run(ctx, fn);
}

export function getCurrentContext(): O11yContext | null {
  return getStorage().getStore() ?? null;
}

export function getCurrentTraceId(): string | null {
  return getCurrentContext()?.traceId ?? null;
}

export function getCurrentSpanId(): string | null {
  return getCurrentContext()?.spanId ?? null;
}

export function getCurrentSessionId(): string | null {
  return getCurrentContext()?.sessionId ?? null;
}
