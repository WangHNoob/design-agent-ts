import { AsyncLocalStorage } from "node:async_hooks";

export interface O11yContext {
  traceId: string;
  spanId: string;
  sessionId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<O11yContext>();

export function runInContext<T>(ctx: O11yContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

export function getCurrentContext(): O11yContext | null {
  return asyncLocalStorage.getStore() ?? null;
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
