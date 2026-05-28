import { describe, it, expect } from "vitest";
import { LangGraphHookAdapter } from "../../../src/adapter/langgraph/LangGraphHookAdapter.js";
import type { AgentHook } from "../../../src/port/hook/AgentHook.js";

describe("LangGraphHookAdapter", () => {
  it("应按 priority 排序执行 hook", async () => {
    const order: number[] = [];
    const hooks: AgentHook[] = [
      { priority: 200, onEvent: async () => { order.push(2); return { metadata: {}, abort: false }; } },
      { priority: 100, onEvent: async () => { order.push(1); return { metadata: {}, abort: false }; } },
      { priority: 300, onEvent: async () => { order.push(3); return { metadata: {}, abort: false }; } },
    ];

    await LangGraphHookAdapter.runHooks(hooks, "pre_reasoning", {});
    expect(order).toEqual([1, 2, 3]);
  });

  it("abort=true 时应中断执行", async () => {
    const order: number[] = [];
    const hooks: AgentHook[] = [
      {
        onEvent: async () => {
          order.push(1);
          return { metadata: {}, abort: true };
        },
      },
      {
        onEvent: async () => {
          order.push(2);
          return { metadata: {}, abort: false };
        },
      },
    ];

    const ctx = await LangGraphHookAdapter.runHooks(hooks, "pre_reasoning", {});
    expect(order).toEqual([1]);
    expect(ctx.abort).toBe(true);
  });

  it("wrapNodeWithHooks 应包装 node 函数", async () => {
    const nodeFn = async (state: Record<string, unknown>) => ({ result: (state.value as number) + 1 });
    const hooks: AgentHook[] = [
      {
        onEvent: async (_point, ctx) => {
          ctx.metadata = { ...ctx.metadata, preCalled: true };
          return ctx;
        },
      },
    ];

    const wrapped = LangGraphHookAdapter.wrapNodeWithHooks(
      nodeFn,
      hooks,
      "pre_reasoning",
      "post_reasoning",
      (state) => ({ metadata: { value: state.value } })
    );

    const result = await wrapped({ value: 5 });
    expect(result).toEqual({ result: 6 });
  });

  it("wrapNodeWithHooks abort 时应返回空对象", async () => {
    const nodeFn = async () => ({ result: 1 });
    const hooks: AgentHook[] = [
      {
        onEvent: async () => ({ metadata: {}, abort: true }),
      },
    ];

    const wrapped = LangGraphHookAdapter.wrapNodeWithHooks(
      nodeFn,
      hooks,
      "pre_reasoning",
      "post_reasoning",
      () => ({})
    );

    const result = await wrapped({});
    expect(result).toEqual({});
  });
});
