import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import type { TraceExporter } from "../../port/tracing/TraceExporter.js";
import type { TraceStorePort } from "../../port/tracing/TraceStorePort.js";
import type {
  RecordSpanInput,
  SpanContext,
  StartSpanOptions,
  StartTraceInput,
  TraceHandle,
  TraceRuntimeState,
  TracerPort,
} from "../../port/tracing/TracerPort.js";
import type { SpanRecord, SpanStatus } from "../../port/tracing/types.js";

type MutableRuntime = {
  userId: string;
  sessionId: string;
  traceId: string;
  executionId?: string;
  stack: SpanContext[];
};

/**
 * Default TracerPort: persists Session/Trace/Span and keeps a parent stack
 * in ContextStoragePort for nested agent spans.
 */
export class DefaultTracer implements TracerPort {
  constructor(
    private readonly store: TraceStorePort,
    private readonly ids: IdGeneratorPort,
    private readonly context: ContextStoragePort<TraceRuntimeState>,
    private readonly exporters: readonly TraceExporter[] = [],
  ) {}

  /**
   * traceId → runtime registry. Streaming consumers interleave their own
   * awaits between generator yields, which drops the ALS context from the
   * generator's continuation; endTrace then cannot see the runtime. The
   * registry keeps a fallback copy so trace completion always persists.
   */
  private readonly runtimes = new Map<string, MutableRuntime>();

  async startTrace(input: StartTraceInput): Promise<TraceHandle> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const session = await this.store.ensureSession({
      id: this.ids.randomUUID(),
      userId: input.userId,
      sessionId: input.sessionId,
    });
    const traceId = this.ids.randomUUID();
    await this.store.createTrace({
      id: traceId,
      userId: input.userId,
      traceSessionId: session.id,
      sessionId: input.sessionId,
      executionId: input.executionId,
      name: input.name,
      attributes: input.attributes,
      startedAt,
    });

    const rootSpan: SpanContext = {
      traceId,
      spanId: this.ids.randomUUID(),
      name: input.name,
      kind: "internal",
      startTime: startedAtMs,
      attributes: {
        ...(input.attributes ?? {}),
        "trace.root": true,
        "trace.userId": input.userId,
        "trace.sessionId": input.sessionId,
        ...(input.executionId ? { "trace.executionId": input.executionId } : {}),
      },
      status: "unset",
    };

    return { traceId, rootSpan };
  }

  async *wrapTraceStream<T>(
    handle: TraceHandle,
    generator: AsyncGenerator<T>,
  ): AsyncGenerator<T> {
    const runtime = this.runtimes.get(handle.traceId) ?? this.runtimeFromHandle(handle);
    this.runtimes.set(handle.traceId, runtime);
    const run = <R>(fn: () => R): R => this.context.run(runtime as TraceRuntimeState, fn);
    const bound: AsyncGenerator<T> = {
      async next(...args: [] | [unknown]) {
        return run(() => generator.next(...(args as [unknown])));
      },
      async return(value?: unknown) {
        return run(() => generator.return(value as T));
      },
      async throw(err?: unknown) {
        return run(() => generator.throw(err));
      },
      [Symbol.asyncIterator]() {
        return bound;
      },
    };
    yield* bound;
  }

  async startSpan(name: string, options: StartSpanOptions = {}): Promise<SpanContext> {
    const runtime = this.requireMutableRuntime();
    const parent = options.parent ?? this.getCurrentSpan() ?? undefined;
    const span: SpanContext = {
      traceId: runtime.traceId,
      spanId: this.ids.randomUUID(),
      parentSpanId: parent?.spanId,
      name,
      kind: options.kind ?? "internal",
      phase: options.phase,
      startTime: Date.now(),
      attributes: { ...(options.attributes ?? {}) },
      status: "unset",
    };
    runtime.stack.push(span);
    return span;
  }

  async endSpan(
    span: SpanContext,
    status: SpanStatus = "ok",
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const runtime = this.getMutableRuntime();
    const endTime = Date.now();
    const completed: SpanContext = {
      ...span,
      endTime,
      status,
      attributes: { ...span.attributes, ...(attributes ?? {}) },
    };
    await this.persistCompleted(completed, status, attributes, runtime?.userId);

    if (runtime && runtime.traceId === span.traceId) {
      const idx = runtime.stack.findIndex((s) => s.spanId === span.spanId);
      if (idx >= 0) runtime.stack.splice(idx, 1);
    }
  }

  async recordSpan(input: RecordSpanInput): Promise<SpanContext> {
    const runtime = this.requireMutableRuntime();
    const parent = this.getCurrentSpan();
    const startTime = input.startTime ?? Date.now();
    const endTime = input.endTime ?? startTime;
    const span: SpanContext = {
      traceId: runtime.traceId,
      spanId: this.ids.randomUUID(),
      parentSpanId: input.parentSpanId ?? parent?.spanId,
      name: input.name,
      kind: input.kind ?? "internal",
      phase: input.phase,
      startTime,
      endTime,
      attributes: { ...(input.attributes ?? {}) },
      status: input.status ?? "ok",
    };
    await this.persistCompleted(span, span.status, undefined, runtime.userId);
    return span;
  }

  async endTrace(
    traceId: string,
    status: SpanStatus = "ok",
    attributes?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    // Prefer the ALS runtime (keeps in-flight stack), fall back to the
    // registry copy when the streaming caller dropped the context.
    const alsRuntime = this.getMutableRuntime();
    const runtime =
      alsRuntime && alsRuntime.traceId === traceId
        ? alsRuntime
        : this.runtimes.get(traceId);
    if (!runtime) return;

    for (const open of [...runtime.stack].reverse()) {
      if (!open.endTime) {
        await this.persistCompleted(
          open,
          status === "error" ? "error" : "ok",
          undefined,
          runtime.userId,
        );
      }
    }
    runtime.stack.length = 0;

    const ended = await this.store.endTrace(runtime.userId, traceId, {
      status,
      attributes,
      endedAt: new Date().toISOString(),
    });
    this.runtimes.delete(traceId);
    if (ended) {
      for (const exporter of this.exporters) {
        await exporter.exportTrace?.(ended);
      }
    }
  }

  getCurrentSpan(): SpanContext | null {
    const stack = this.context.getStore()?.stack;
    if (!stack || stack.length === 0) return null;
    return stack[stack.length - 1] ?? null;
  }

  getCurrentTrace(): TraceRuntimeState | null {
    return this.context.getStore() ?? null;
  }

  async withSpan<R>(span: SpanContext, callback: () => R | Promise<R>): Promise<R> {
    const current = this.requireMutableRuntime();
    if (current.traceId !== span.traceId) {
      throw new Error("withSpan requires an active matching trace runtime");
    }
    const nested: MutableRuntime = {
      userId: current.userId,
      sessionId: current.sessionId,
      traceId: current.traceId,
      executionId: current.executionId,
      stack: [...current.stack.filter((s) => s.spanId !== span.spanId), span],
    };
    return this.context.run(nested as TraceRuntimeState, () => Promise.resolve(callback()));
  }

  async withTrace<R>(handle: TraceHandle, callback: () => R | Promise<R>): Promise<R> {
    const runtime = this.runtimeFromHandle(handle);
    return this.context.run(runtime as TraceRuntimeState, () => Promise.resolve(callback()));
  }

  /**
   * Bind trace runtime for async generators (SSE / executeStream).
   * Prefer withTrace for plain async/await. Returns an unbind function.
   */
  bindTrace(handle: TraceHandle): () => void {
    if (!this.context.enterWith) {
      throw new Error("ContextStoragePort.enterWith is required for bindTrace / streaming");
    }
    const previous = this.context.getStore();
    this.context.enterWith(this.runtimeFromHandle(handle) as TraceRuntimeState);
    return () => {
      if (previous) {
        this.context.enterWith?.(previous);
      }
    };
  }

  private runtimeFromHandle(handle: TraceHandle): MutableRuntime {
    const userId = String(handle.rootSpan.attributes["trace.userId"] ?? "");
    const sessionId = String(handle.rootSpan.attributes["trace.sessionId"] ?? "");
    const rawExecutionId = handle.rootSpan.attributes["trace.executionId"];
    const executionId = typeof rawExecutionId === "string" && rawExecutionId.length > 0
      ? rawExecutionId
      : undefined;
    if (!userId || !sessionId) {
      throw new Error("TraceHandle rootSpan must carry trace.userId and trace.sessionId");
    }
    return {
      userId,
      sessionId,
      traceId: handle.traceId,
      executionId,
      stack: [handle.rootSpan],
    };
  }

  private requireMutableRuntime(): MutableRuntime {
    const runtime = this.getMutableRuntime();
    if (!runtime) {
      throw new Error("No active trace runtime — call startTrace/withTrace first");
    }
    return runtime;
  }

  private getMutableRuntime(): MutableRuntime | null {
    return (this.context.getStore() as MutableRuntime | undefined) ?? null;
  }

  private async persistCompleted(
    span: SpanContext,
    status: SpanStatus,
    attributes: Readonly<Record<string, unknown>> | undefined,
    userId: string | undefined,
  ): Promise<void> {
    if (!userId) return;

    const endTime = span.endTime ?? Date.now();
    const record: SpanRecord = {
      id: span.spanId,
      userId,
      traceId: span.traceId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      phase: span.phase,
      kind: span.kind,
      status,
      attributes: { ...span.attributes, ...(attributes ?? {}) },
      startedAt: new Date(span.startTime).toISOString(),
      endedAt: new Date(endTime).toISOString(),
      createdAt: new Date(endTime).toISOString(),
    };
    await this.store.appendSpan(record);
    for (const exporter of this.exporters) {
      await exporter.exportSpans([record]);
    }
  }
}

/**
 * No-op tracer when tracing is disabled — keeps Director/hooks branching free.
 */
export class NoOpTracer implements TracerPort {
  async startTrace(input: StartTraceInput): Promise<TraceHandle> {
    return {
      traceId: "noop",
      rootSpan: {
        traceId: "noop",
        spanId: "noop-root",
        name: input.name,
        kind: "internal",
        startTime: Date.now(),
        attributes: {
          "trace.userId": input.userId,
          "trace.sessionId": input.sessionId,
          ...(input.executionId ? { "trace.executionId": input.executionId } : {}),
        },
        status: "unset",
      },
    };
  }
  async startSpan(name: string): Promise<SpanContext> {
    return {
      traceId: "noop",
      spanId: "noop",
      name,
      kind: "internal",
      startTime: Date.now(),
      attributes: {},
      status: "unset",
    };
  }
  async endSpan(): Promise<void> {}
  async recordSpan(input: RecordSpanInput): Promise<SpanContext> {
    return {
      traceId: "noop",
      spanId: "noop",
      name: input.name,
      kind: "internal",
      startTime: Date.now(),
      endTime: Date.now(),
      attributes: {},
      status: "ok",
    };
  }
  async endTrace(): Promise<void> {}
  getCurrentSpan(): SpanContext | null {
    return null;
  }
  getCurrentTrace(): TraceRuntimeState | null {
    return null;
  }
  async withSpan<R>(_span: SpanContext, callback: () => R | Promise<R>): Promise<R> {
    return callback();
  }
  async withTrace<R>(_handle: TraceHandle, callback: () => R | Promise<R>): Promise<R> {
    return callback();
  }
  async *wrapTraceStream<T>(_handle: TraceHandle, generator: AsyncGenerator<T>): AsyncGenerator<T> {
    yield* generator;
  }
}
