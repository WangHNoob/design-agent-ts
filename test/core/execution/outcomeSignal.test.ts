import { describe, expect, test } from "vitest";
import {
  buildOutcomeSignal,
  executionModeOf,
  hashRequirement,
  normalizeRequirement,
  requirementHashOf,
} from "../../../src/core/execution/outcomeSignal.js";

describe("outcomeSignal (flywheel 01-P4)", () => {
  test("normalizes whitespace and case before hashing", () => {
    expect(normalizeRequirement("  设计  一个 游戏\n\n 系统 ")).toBe("设计 一个 游戏 系统");
    expect(hashRequirement("Design a game")).toBe(hashRequirement("  design   A GAME  "));
    expect(hashRequirement("设计一个游戏")).not.toBe(hashRequirement("设计两个游戏"));
  });

  test("requirementHashOf falls back to empty requirement", () => {
    expect(requirementHashOf({ requirement: "x" })).toBe(hashRequirement("x"));
    expect(requirementHashOf({})).toBe(hashRequirement(""));
    expect(requirementHashOf({ requirement: 42 })).toBe(hashRequirement(""));
    expect(requirementHashOf(undefined)).toBe(hashRequirement(""));
  });

  test("executionModeOf defaults malformed modes to query", () => {
    expect(executionModeOf({ mode: "design" })).toBe("design");
    expect(executionModeOf({ mode: "table" })).toBe("table");
    expect(executionModeOf({ mode: "query" })).toBe("query");
    expect(executionModeOf({ mode: "bogus" })).toBe("query");
    expect(executionModeOf(undefined)).toBe("query");
  });

  test("buildOutcomeSignal fills all fields with defaults", () => {
    const signal = buildOutcomeSignal(
      { id: "exec-1", requestPayload: { requirement: " 设计  系统 ", mode: "design" } },
      "failed",
      { attempts: 2, hitlCheckpoints: ["hitl-1-task-plan"], failReason: "permanent" },
    );
    expect(signal).toEqual({
      executionId: "exec-1",
      mode: "design",
      outcome: "failed",
      attempts: 2,
      hitlCheckpoints: ["hitl-1-task-plan"],
      requirementHash: hashRequirement(" 设计  系统 "),
      failReason: "permanent",
    });
  });

  test("omits failReason when absent and copies hitlCheckpoints defensively", () => {
    const source = ["hitl-3-final"];
    const signal = buildOutcomeSignal(
      { id: "exec-2", requestPayload: {} },
      "success",
      { hitlCheckpoints: source },
    );
    expect(signal.failReason).toBeUndefined();
    source.push("mutated");
    expect(signal.hitlCheckpoints).toEqual(["hitl-3-final"]);
  });

  test("hitl_rejected / hitl_modified outcomes are expressible", () => {
    const base = { id: "exec-3", requestPayload: { requirement: "r", mode: "query" } };
    expect(buildOutcomeSignal(base, "hitl_rejected").outcome).toBe("hitl_rejected");
    expect(buildOutcomeSignal(base, "hitl_modified").outcome).toBe("hitl_modified");
  });
});
