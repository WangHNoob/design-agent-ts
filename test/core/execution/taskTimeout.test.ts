import { describe, expect, it } from "vitest";
import { isTaskTimeoutSignal, taskTimeoutMessage } from "../../../src/core/execution/taskTimeout.js";

describe("isTaskTimeoutSignal", () => {
  it("TimeoutError 名字的 abort reason 判为超时（TaskTimeoutError / deadline）", () => {
    const controller = new AbortController();
    const err = new Error("Task F1 timed out after 300000ms");
    err.name = "TimeoutError";
    controller.abort(err);
    expect(isTaskTimeoutSignal(controller.signal)).toBe(true);
    expect(taskTimeoutMessage(controller.signal)).toBe("Task F1 timed out after 300000ms");
  });

  it("用户取消（AbortError DOMException）不判为超时", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Execution cancelled", "AbortError"));
    expect(isTaskTimeoutSignal(controller.signal)).toBe(false);
  });

  it("无 reason / 无 signal 不判为超时", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isTaskTimeoutSignal(controller.signal)).toBe(false);
    expect(isTaskTimeoutSignal(undefined)).toBe(false);
    expect(taskTimeoutMessage(undefined)).toBe("Task timed out");
  });
});
