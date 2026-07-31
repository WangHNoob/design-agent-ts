import { describe, expect, test, vi } from "vitest";

const streamMock = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation((config: { model: string }) => ({
    modelName: config.model,
    stream: streamMock,
    bindTools: vi.fn().mockReturnThis(),
  })),
}));

import { LangGraphModelAdapter } from "../../../src/adapter/langgraph/LangGraphModelAdapter.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { InMemoryTraceStore } from "../../../src/core/tracing/InMemoryTraceStore.js";
import { DefaultTracer } from "../../../src/core/tracing/DefaultTracer.js";
import type { ContextStoragePort } from "../../../src/port/infra/ContextStoragePort.js";
import type { IdGeneratorPort } from "../../../src/port/infra/IdGeneratorPort.js";
import type { TraceRuntimeState } from "../../../src/port/tracing/TracerPort.js";

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
}

describe("LangGraphModelAdapter fallback", () => {
  test("promotes fallback model after retriable failure and records span", async () => {
    streamMock
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockImplementationOnce(async function* () {
        yield {
          content: "ok from fallback",
          usage_metadata: { input_tokens: 1, output_tokens: 1 },
          response_metadata: { finish_reason: "stop" },
          additional_kwargs: {},
        };
      });

    const store = new InMemoryTraceStore();
    const tracer = new DefaultTracer(store, new FakeIds(), new MemoryContext<TraceRuntimeState>());
    const adapter = new LangGraphModelAdapter(
      { provider: "openai", modelName: "primary-model", apiKey: "k" },
      {
        fallbacks: [{ provider: "openai", modelName: "fallback-model", apiKey: "k" }],
        failureThreshold: 1,
        tracer,
      },
    );

    const handle = await tracer.startTrace({
      sessionId: "s",
      userId: "u",
      name: "director.query",
    });

    const response = await tracer.withTrace(handle, async () => {
      const result = await adapter.generate([ChatMessage.text("user", "u", "hi")]);
      await tracer.endTrace(handle.traceId, "ok");
      return result;
    });

    expect(response.message).toBeTruthy();
    expect(adapter.getActiveModelName()).toBe("fallback-model");
    const detail = await store.getTrace("u", handle.traceId);
    expect(detail!.spans.some((s) => s.name === "model.fallback")).toBe(true);
  });

  test("fails loud when no fallback remains", async () => {
    streamMock.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const adapter = new LangGraphModelAdapter(
      { provider: "openai", modelName: "only", apiKey: "k" },
      { failureThreshold: 1 },
    );

    await expect(
      adapter.generate([ChatMessage.text("user", "u", "hi")]),
    ).rejects.toThrow(/All models unavailable/);
  });
});
