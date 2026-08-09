import { describe, expect, test } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import {
  REPEAT_CANCEL_THRESHOLD,
  collectRepeatedToolCalls,
  countToolCallOccurrences,
  toolCallSignature,
  truncateToolResult,
} from "../../../src/adapter/langgraph/LangGraphAgentAdapter.js";

function aiCall(id: string, name: string, args: Record<string, unknown>): AIMessage {
  return new AIMessage({ content: "", tool_calls: [{ id, name, args }] });
}

describe("toolCallSignature / countToolCallOccurrences", () => {
  test("字符串与数字参数视为同一调用（EV-021 回归）", () => {
    const history = [aiCall("c1", "kb_query_table", { table: "ShopItem", limit: "40" })];
    const sig = toolCallSignature("kb_query_table", { table: "ShopItem", limit: 40 });
    expect(countToolCallOccurrences(history, sig)).toBe(1);
  });

  test("跨多条 assistant 消息累计计数", () => {
    const history = [
      aiCall("c1", "kb_query_table", { table: "ShopItem", limit: "40" }),
      new AIMessage({ content: "mid" }),
      aiCall("c2", "kb_query_table", { table: "ShopItem", limit: 40 }),
    ];
    const sig = toolCallSignature("kb_query_table", { table: "ShopItem", limit: 40 });
    expect(countToolCallOccurrences(history, sig)).toBe(2);
  });

  test("不同工具/参数不计入", () => {
    const history = [
      aiCall("c1", "kb_query_table", { table: "ShopItem", limit: 40 }),
      aiCall("c2", "kb_get_page", { page: "wiki/concepts/01.md" }),
    ];
    const sig = toolCallSignature("kb_get_page", { page: "wiki/concepts/01.md" });
    expect(countToolCallOccurrences(history, sig)).toBe(1);
  });
});

describe("collectRepeatedToolCalls", () => {
  test("只返回出现 >=2 次的调用", () => {
    const history = [
      aiCall("c1", "kb_query_table", { table: "ShopItem", limit: "40" }),
      aiCall("c2", "kb_query_table", { table: "ShopItem", limit: 40 }),
      aiCall("c3", "kb_search", { query: "商店限购" }),
    ];
    const repeated = collectRepeatedToolCalls(history);
    expect(repeated).toEqual([["kb_query_table", 2]]);
  });

  test("REPEAT_CANCEL_THRESHOLD 为 2（第三次尝试才取消）", () => {
    expect(REPEAT_CANCEL_THRESHOLD).toBe(2);
    const history = [
      aiCall("c1", "kb_query_table", { table: "ShopItem", limit: 40 }),
      aiCall("c2", "kb_query_table", { table: "ShopItem", limit: 40 }),
      aiCall("c3", "kb_query_table", { table: "ShopItem", limit: 40 }),
    ];
    const sig = toolCallSignature("kb_query_table", { table: "ShopItem", limit: 40 });
    // 第三次尝试时历史已出现 2 次 → 达到取消阈值
    expect(countToolCallOccurrences(history.slice(0, 2), sig)).toBe(2);
  });
});

describe("truncateToolResult", () => {
  test("超长内容截断并标注原长", () => {
    const out = truncateToolResult("x".repeat(100), 20);
    expect(out.startsWith("x".repeat(20))).toBe(true);
    expect(out).toContain("已截断 原长 100 字符");
    expect(out.length).toBeLessThan(60);
  });

  test("未超限原样返回", () => {
    expect(truncateToolResult("short", 100)).toBe("short");
  });
});
