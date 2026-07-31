import { describe, it, expect } from "vitest";
import { CancellationHook } from "../../../src/core/hook/CancellationHook.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";
import {
  buildCancellationPayload,
  isCancellationScenario,
} from "../../../src/core/execution/CancellationPayload.js";
import type { TaskResult } from "../../../src/core/schema/TaskResult.js";

describe("CancellationHook", () => {
  const hook = new CancellationHook();

  it("pre_reasoning 应在 signal aborted 时设置 abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = HookContext.create({
      metadata: { abortSignal: controller.signal },
    });
    const next = await hook.onEvent("pre_reasoning", ctx);
    expect(next.abort).toBe(true);
    expect(next.abortReason).toBe("CANCELLED");
  });

  it("post_tool_execution 同样检查取消", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = HookContext.create({
      metadata: { abortSignal: controller.signal },
    });
    const next = await hook.onEvent("post_tool_execution", ctx);
    expect(next.abort).toBe(true);
  });
});

describe("CancellationPayload", () => {
  it("应拆分 completed 与 incomplete 任务", () => {
    const results: TaskResult[] = [
      { taskId: "A", domain: "system", status: "success", output: "ok", errorMessage: null },
      { taskId: "B", domain: "combat", status: "cancelled", output: "", errorMessage: "cancelled" },
    ];
    const payload = buildCancellationPayload(results, "partial", "cancelled by user");
    expect(payload.completedTasks).toEqual([{ id: "A", status: "success", domain: "system" }]);
    expect(payload.incompleteTasks).toEqual([{ id: "B", status: "cancelled", domain: "combat" }]);
    expect(payload.partialOutput).toBe("partial");
    expect(payload.message).toBe("cancelled by user");
  });

  it("isCancellationScenario 识别取消场景", () => {
    const results: TaskResult[] = [
      { taskId: "A", domain: "system", status: "success", output: "ok", errorMessage: null },
      { taskId: "B", domain: "combat", status: "cancelled", output: "", errorMessage: "cancelled" },
    ];
    const signal = new AbortController().signal;
    expect(isCancellationScenario(results, signal)).toBe(true);
    expect(isCancellationScenario(results)).toBe(true);
    const errorResults: TaskResult[] = [
      { taskId: "A", domain: "system", status: "error", output: "", errorMessage: "fail" },
    ];
    expect(isCancellationScenario(errorResults)).toBe(false);
  });
});
