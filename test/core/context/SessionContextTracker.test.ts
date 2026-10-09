import { describe, expect, test } from "vitest";
import {
  recordSessionContext,
  getSessionContextUsage,
  effectiveContextBudget,
} from "../../../src/core/context/SessionContextTracker.js";

describe("SessionContextTracker", () => {
  test("记录并读取；最近一次为准（压缩后如实回落）", () => {
    recordSessionContext("s-ctx", { tokens: 45_230, window: 1_000_000, model: "glm-5.3-flash" });
    expect(getSessionContextUsage("s-ctx")?.tokens).toBe(45_230);

    // 压缩发生后下一次调用的 input 回落 → latest 如实反映
    recordSessionContext("s-ctx", { tokens: 12_000, window: 1_000_000, model: "glm-5.3-flash" });
    expect(getSessionContextUsage("s-ctx")?.tokens).toBe(12_000);
  });

  test("无效记录被忽略", () => {
    recordSessionContext("s-none", { tokens: 0, window: null, model: "m" });
    expect(getSessionContextUsage("s-none") ?? null).toBeNull();
  });

  test("不同会话互不干扰", () => {
    recordSessionContext("s-a", { tokens: 100, window: null, model: "a" });
    recordSessionContext("s-b", { tokens: 200, window: null, model: "b" });
    expect(getSessionContextUsage("s-a")?.tokens).toBe(100);
    expect(getSessionContextUsage("s-b")?.tokens).toBe(200);
  });
});

describe("effectiveContextBudget（压缩预算口径）", () => {
  test("模型窗口小于全局上限：threshold × 窗口", () => {
    expect(effectiveContextBudget(100_000, 200_000, 0.8)).toBe(80_000);
  });

  test("模型窗口大于全局上限：threshold × 全局上限", () => {
    expect(effectiveContextBudget(1_000_000, 200_000, 0.8)).toBe(160_000);
  });

  test("窗口未知：按全局上限", () => {
    expect(effectiveContextBudget(null, 200_000, 0.8)).toBe(160_000);
  });
});
