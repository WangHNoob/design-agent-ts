import { describe, expect, test } from "vitest";
import { InMemoryTraceStore } from "../../../src/core/tracing/InMemoryTraceStore.js";
import { DefaultTracer } from "../../../src/core/tracing/DefaultTracer.js";
import { TracingHook } from "../../../src/core/hook/TracingHook.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";
import type { ContextStoragePort } from "../../../src/port/infra/ContextStoragePort.js";
import type { TraceRuntimeState } from "../../../src/port/tracing/TracerPort.js";
import type { IdGeneratorPort } from "../../../src/port/infra/IdGeneratorPort.js";
import { NINE_SPAN_PHASES } from "../../../src/port/tracing/types.js";

class FakeIds implements IdGeneratorPort {
  private n = 0;
  randomUUID(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

class MemoryContext<T> implements ContextStoragePort<T> {
  private store: T | undefined;
  run<R>(next: T, callback: () => R): R {
    const prev = this.store;
    this.store = next;
    try {
      const result = callback();
      if (result != null && typeof (result as { then?: unknown }).then === "function") {
        return (Promise.resolve(result) as Promise<unknown>).finally(() => {
          this.store = prev;
        }) as R;
      }
      this.store = prev;
      return result;
    } catch (error) {
      this.store = prev;
      throw error;
    }
  }
  getStore(): T | undefined {
    return this.store;
  }
  enterWith(next: T): void {
    this.store = next;
  }
}

describe("DefaultTracer + TracingHook", () => {
  test("persists session/trace/span tree with nine ReAct phases and parent links", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TracingHook(tracer);

    const handle = await tracer.startTrace({
      sessionId: "sess-1",
      userId: "user-1",
      name: "director.query",
      attributes: { mode: "query" },
    });

    await tracer.withTrace(handle, async () => {
      await hook.onEvent(
        "pre_agent_call",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1" }),
      );
      await hook.onEvent(
        "pre_reasoning",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1", iteration: 1 }),
      );
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1", iteration: 1 }),
      );
      await hook.onEvent(
        "pre_tool_execution",
        HookContext.create({
          agentName: "QueryAgent",
          sessionId: "sess-1",
          toolName: "wiki_read",
          toolArguments: { pagePath: "x" },
        }),
      );
      await hook.onEvent(
        "post_tool_execution",
        HookContext.create({
          agentName: "QueryAgent",
          sessionId: "sess-1",
          toolName: "wiki_read",
          toolResult: "ok",
        }),
      );
      await hook.onEvent(
        "pre_summary",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1" }),
      );
      await hook.onEvent(
        "post_summary",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1" }),
      );
      await hook.onEvent(
        "post_agent_call",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1" }),
      );
      await tracer.endTrace(handle.traceId, "ok");
    });

    const detail = await store.getTrace("user-1", handle.traceId);
    expect(detail).not.toBeNull();
    expect(detail!.trace.status).toBe("ok");
    expect(detail!.session.sessionId).toBe("sess-1");

    const phases = new Set(
      detail!.spans.map((s) => s.phase).filter((p): p is (typeof NINE_SPAN_PHASES)[number] => !!p),
    );
    for (const phase of NINE_SPAN_PHASES) {
      if (phase === "on_error") continue; // happy path
      expect(phases.has(phase), `missing phase ${phase}`).toBe(true);
    }

    const agentSpan = detail!.spans.find((s) => s.name === "agent.QueryAgent");
    expect(agentSpan).toBeDefined();
    const child = detail!.spans.find((s) => s.phase === "pre_reasoning");
    expect(child?.parentSpanId).toBe(agentSpan!.id);

    // Spans are immutable — duplicate append fails
    await expect(
      store.appendSpan({ ...detail!.spans[0]!, id: detail!.spans[0]!.id }),
    ).rejects.toThrow(/immutable/);
  });

  test("cross-tenant getTrace returns null", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const handle = await tracer.startTrace({
      sessionId: "s",
      userId: "user-a",
      name: "director.query",
    });
    await tracer.withTrace(handle, async () => {
      await tracer.recordSpan({ name: "x", phase: "pre_reasoning" });
      await tracer.endTrace(handle.traceId, "ok");
    });
    await expect(store.getTrace("user-b", handle.traceId)).resolves.toBeNull();
  });
});
