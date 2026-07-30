import { describe, expect, test } from "vitest";
import {
  ExecutionStateMachine,
  InvalidExecutionTransitionError,
} from "../../../src/core/execution/ExecutionStateMachine.js";

describe("ExecutionStateMachine", () => {
  test("accepts the supported execution lifecycle", () => {
    expect(ExecutionStateMachine.canTransition("queued", "running")).toBe(true);
    expect(ExecutionStateMachine.canTransition("running", "waiting_hitl")).toBe(true);
    expect(ExecutionStateMachine.canTransition("waiting_hitl", "queued")).toBe(true);
    expect(ExecutionStateMachine.canTransition("running", "completed")).toBe(true);
  });

  test("allows cancellation and timeout from every active status", () => {
    for (const status of ["queued", "running", "waiting_hitl"] as const) {
      expect(ExecutionStateMachine.canTransition(status, "cancelled")).toBe(true);
      expect(ExecutionStateMachine.canTransition(status, "timed_out")).toBe(true);
    }
  });

  test("rejects illegal transitions and keeps terminal states closed", () => {
    expect(ExecutionStateMachine.isTerminal("completed")).toBe(true);
    expect(ExecutionStateMachine.allowedTransitions("completed")).toEqual([]);
    expect(() => ExecutionStateMachine.assertTransition("execution-1", "queued", "completed"))
      .toThrow(InvalidExecutionTransitionError);
  });
});
