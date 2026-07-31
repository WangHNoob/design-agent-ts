import { describe, it, expect, vi } from "vitest";
import { SagaCoordinator } from "../../../src/core/saga/SagaCoordinator.js";
import { InMemoryCompensateFailureQueue } from "../../../src/core/saga/InMemoryCompensateFailureQueue.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import type { CompensateHandler } from "../../../src/port/tool/ToolCompensate.js";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";
import { ToolFastFailError } from "../../../src/core/tool/ToolFastFailError.js";
import { DEFAULT_TOOL_FAILURE_POLICY } from "../../../src/port/tool/ToolFailurePolicy.js";

function createCompensatableTool(
  name: string,
  executeImpl: (args: Record<string, unknown>) => Promise<ToolResult>,
  compensateImpl: CompensateHandler["compensate"],
  onCompensateFailure?: CompensateHandler["onCompensateFailure"],
): ToolPort {
  const descriptor: ToolDescriptor = {
    name,
    description: `test tool ${name}`,
    parameters: {
      step: { type: "string", description: "step id", required: true },
    },
  };
  return {
    getDescriptor: () => descriptor,
    execute: executeImpl,
    getFailurePolicy: () => ({ ...DEFAULT_TOOL_FAILURE_POLICY, onError: "fast_fail" }),
    getCompensateHandler: () => ({
      compensate: compensateImpl,
      onCompensateFailure,
    }),
  };
}

describe("SagaCoordinator", () => {
  it("成功两步后第三步失败应逆序 compensate", async () => {
    const order: string[] = [];
    const queue = new InMemoryCompensateFailureQueue();
    const saga = new SagaCoordinator({
      enabled: true,
      sessionId: "s1",
      agentName: "TestAgent",
      failureQueue: queue,
    });

    const toolA = createCompensatableTool(
      "step_a",
      async () => ToolResult.success("a"),
      async () => {
        order.push("compensate_a");
        return ToolResult.success("undid_a");
      },
    );
    const toolB = createCompensatableTool(
      "step_b",
      async () => ToolResult.success("b"),
      async () => {
        order.push("compensate_b");
        return ToolResult.success("undid_b");
      },
    );

    saga.register("step_a", { step: "a" }, ToolResult.success("a"), toolA.getCompensateHandler!());
    saga.register("step_b", { step: "b" }, ToolResult.success("b"), toolB.getCompensateHandler!());

    const summary = await saga.compensateAll("step_c_failed");

    expect(order).toEqual(["compensate_b", "compensate_a"]);
    expect(summary.allSucceeded).toBe(true);
    expect(summary.results).toHaveLength(2);
    expect(queue.records).toHaveLength(0);
  });

  it("compensate 失败应入队且可审计", async () => {
    const queue = new InMemoryCompensateFailureQueue();
    const saga = new SagaCoordinator({
      enabled: true,
      sessionId: "s1",
      agentName: "TestAgent",
      failureQueue: queue,
    });

    const tool = createCompensatableTool(
      "step_a",
      async () => ToolResult.success("a"),
      async () => ToolResult.error("compensate boom"),
    );

    saga.register("step_a", { step: "a" }, ToolResult.success("a"), tool.getCompensateHandler!());

    const summary = await saga.compensateAll("downstream_fail");

    expect(summary.allSucceeded).toBe(false);
    expect(summary.results[0]).toMatchObject({
      toolName: "step_a",
      success: false,
      queued: true,
    });
    expect(queue.records).toHaveLength(1);
    expect(queue.records[0]).toMatchObject({
      toolName: "step_a",
      compensateError: "compensate boom",
      reason: "downstream_fail",
      sessionId: "s1",
    });
  });

  it("compensate 抛错且 onCompensateFailure=ignore 不入队", async () => {
    const queue = new InMemoryCompensateFailureQueue();
    const saga = new SagaCoordinator({
      enabled: true,
      failureQueue: queue,
    });

    const handler: CompensateHandler = {
      onCompensateFailure: "ignore",
      compensate: vi.fn(async () => {
        throw new Error("hard fail");
      }),
    };

    saga.register("step_x", { step: "x" }, ToolResult.success("x"), handler);
    const summary = await saga.compensateAll("abort");

    expect(summary.results[0]?.queued).toBe(false);
    expect(queue.records).toHaveLength(0);
  });

  it("compensate 返回 isError 且 onCompensateFailure=ignore 不入队", async () => {
    const queue = new InMemoryCompensateFailureQueue();
    const saga = new SagaCoordinator({
      enabled: true,
      failureQueue: queue,
    });

    const handler: CompensateHandler = {
      onCompensateFailure: "ignore",
      compensate: vi.fn(async () => ToolResult.error("soft fail")),
    };

    saga.register("step_y", { step: "y" }, ToolResult.success("y"), handler);
    const summary = await saga.compensateAll("rollback");

    expect(summary.allSucceeded).toBe(false);
    expect(summary.results[0]).toMatchObject({
      toolName: "step_y",
      success: false,
      error: "soft fail",
      queued: false,
    });
    expect(queue.records).toHaveLength(0);
  });
});

describe("compensatable tool fast_fail triggers saga", () => {
  it("ToolFastFailError 表示不可恢复失败", () => {
    const err = new ToolFastFailError("step_c", "boom");
    expect(err.toolName).toBe("step_c");
    expect(err.message).toContain("boom");
  });
});
