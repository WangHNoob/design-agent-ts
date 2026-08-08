import { AsyncLocalStorage } from "node:async_hooks";
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

/** Real AsyncLocalStorage-backed context — reproduces production propagation. */
class AlsContext<T> implements ContextStoragePort<T> {
  private readonly als = new AsyncLocalStorage<T>();
  run<R>(next: T, callback: () => R): R {
    return this.als.run(next, callback);
  }
  getStore(): T | undefined {
    return this.als.getStore();
  }
  enterWith(next: T): void {
    this.als.enterWith(next);
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

  test("propagates executionId into trace runtime state", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);

    const handle = await tracer.startTrace({
      sessionId: "sess-exec",
      userId: "user-1",
      name: "director.design",
      executionId: "exec-123",
    });

    await tracer.withTrace(handle, async () => {
      const runtime = tracer.getCurrentTrace();
      expect(runtime?.executionId).toBe("exec-123");
      expect(handle.rootSpan.attributes["trace.executionId"]).toBe("exec-123");
      await tracer.endTrace(handle.traceId, "ok");
    });
  });

  test("streaming: wrapTraceStream survives consumer-side awaits and endTrace persists via registry", async () => {
    const store = new InMemoryTraceStore();
    const context = new AlsContext<TraceRuntimeState>();
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TracingHook(tracer);

    async function* stream(): AsyncGenerator<{ type: string }> {
      // Phase hooks fire inside the generator's own async chain (LangGraph
      // boundaries in production). With a bare enterWith/bindTrace the ALS
      // store is dropped once the consumer interleaves its own awaits.
      await Promise.resolve();
      await hook.onEvent(
        "pre_reasoning",
        HookContext.create({ agentName: "QueryAgent", sessionId: "sess-1", iteration: 0 }),
      );
      yield { type: "chunk" };
      await Promise.resolve();
      yield { type: "complete" };
    }

    const handle = await tracer.startTrace({
      sessionId: "sess-1",
      userId: "user-1",
      name: "director.query",
      attributes: { mode: "query" },
    });
    const unbind = tracer.bindTrace(handle);
    const traced = tracer.wrapTraceStream(handle, stream());

    // Consumer with interleaved awaits between yields (ExecutionWorker
    // appends events to Redis in the loop body).
    for await (const event of traced) {
      await Promise.resolve();
      expect(event.type).toBeTruthy();
    }
    unbind();

    // endTrace runs in the consumer context, outside the trace context —
    // the registry fallback must still persist status/ended_at + root span.
    await tracer.endTrace(handle.traceId, "ok");

    const detail = await store.getTrace("user-1", handle.traceId);
    expect(detail).not.toBeNull();
    expect(detail!.trace.status).toBe("ok");
    expect(detail!.trace.endedAt).toBeTruthy();
    const names = detail!.spans.map((s) => s.name);
    expect(names).toContain("QueryAgent.pre_reasoning");
    expect(names).toContain("director.query"); // root span flushed at endTrace
  });

  test("span attributes capture tool I/O and LLM reasoning/output with truncation", async () => {
    const store = new InMemoryTraceStore();
    const context = new MemoryContext<TraceRuntimeState>();
    // 极小截断阈值验证 truncate 生效
    const tracer = new DefaultTracer(store, new FakeIds(), context);
    const hook = new TracingHook(tracer, { maxAttrChars: 40 });

    const handle = await tracer.startTrace({
      sessionId: "sess-1",
      userId: "user-1",
      name: "director.query",
    });
    await tracer.withTrace(handle, async () => {
      await hook.onEvent(
        "pre_tool_execution",
        HookContext.create({
          agentName: "QueryAgent",
          sessionId: "sess-1",
          toolName: "kb_query_table",
          toolArguments: { table: "Hero.csv", where: "heroId = H001 with a very long description" },
        }),
      );
      await hook.onEvent(
        "post_tool_execution",
        HookContext.create({
          agentName: "QueryAgent",
          sessionId: "sess-1",
          toolName: "kb_query_table",
          toolResult: "trust=0.938 trusted heroId=H001 baseAtk=110 (long result payload truncated here)",
        }),
      );
      await hook.onEvent(
        "post_reasoning",
        HookContext.create({
          agentName: "QueryAgent",
          sessionId: "sess-1",
          iteration: 1,
          llmReasoning: "思考：先查 Hero.csv，再核对字段命名约定，最后给出 baseAtk 字段",
          llmOutput: "H001 的基础攻击力为 110",
          inputTokenCount: 100,
          outputTokenCount: 20,
        }),
      );
      await tracer.endTrace(handle.traceId, "ok");
    });

    const detail = await store.getTrace("user-1", handle.traceId);
    const spans = new Map(detail!.spans.map((s) => [s.name, s.attributes]));

    const preTool = spans.get("QueryAgent.pre_tool_execution");
    expect(preTool?.["toolName"]).toBe("kb_query_table");
    expect(String(preTool?.["toolArguments"])).toContain("…[+"); // 截断标记
    expect(String(preTool?.["toolArguments"])).toContain("Hero.csv");

    const postTool = spans.get("QueryAgent.post_tool_execution");
    expect(String(postTool?.["toolResult"])).toContain("trust=0.938");
    expect(String(postTool?.["toolResult"])).toContain("…[+");

    const postReasoning = spans.get("QueryAgent.post_reasoning");
    expect(postReasoning?.["llmReasoning"]).toBe("思考：先查 Hero.csv，再核对字段命名约定，最后给出 baseAtk 字段");
    expect(postReasoning?.["llmOutput"]).toBe("H001 的基础攻击力为 110");
    expect(postReasoning?.["inputTokens"]).toBe(100);
    expect(postReasoning?.["outputTokens"]).toBe(20);
  });
});
