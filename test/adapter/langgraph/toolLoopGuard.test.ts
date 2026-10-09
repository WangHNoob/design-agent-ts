import { describe, expect, test } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  REPEAT_CANCEL_THRESHOLD,
  collectRepeatedToolCalls,
  countToolCallOccurrences,
  findCurrentTurnStart,
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

  test("跨 agent 同参调用不互相计数（轮次切片 + agentName 双重隔离）", () => {
    // 实测回归：同 session 所有 agent 共享一条线程，QA 首次 workspace_list
    // 因前两个 agent 调过同参调用被判 prior=2 取消。
    const sharedThread = [
      new HumanMessage({ content: "GameplayDesigner 的任务" }),
      aiCall("c1", "workspace_list", {}),
      aiCall("c2", "workspace_list", {}),
      new HumanMessage({ content: "QAPlanner 的任务" }),
      aiCall("c3", "workspace_read", { task_id: "F3_combat_design" }),
    ];
    const qaSig = toolCallSignature("workspace_list", {}, "QAPlanner");

    // 主路径（模拟 QA toolNode）：priorMessages 去掉当前 AI，再切到本轮起点。
    // 跨 agent 隔离由轮次切片保证——其他 agent 的调用都在本轮起点之前。
    const priorMessages = sharedThread.slice(0, -1);
    const turnMessages = priorMessages.slice(findCurrentTurnStart(priorMessages));
    expect(turnMessages).toHaveLength(0);
    expect(countToolCallOccurrences(turnMessages, qaSig, "QAPlanner")).toBe(0);

    // agentName 是 key 空间隔离（历史消息无 agent 归属，全历史计数时同 key
    // 调用按同一 agent 计）——所以守卫必须配合轮次切片使用。
    expect(countToolCallOccurrences(sharedThread, qaSig, "QAPlanner")).toBe(2);
  });
});

describe("findCurrentTurnStart（本轮起点）", () => {
  test("最后一条 HumanMessage 之后为本轮", () => {
    const messages = [
      new HumanMessage({ content: "turn-1 任务" }),
      aiCall("c1", "workspace_read", { task_id: "F1" }),
      new HumanMessage({ content: "turn-2 任务" }),
      aiCall("c2", "workspace_read", { task_id: "F1" }),
    ];
    expect(findCurrentTurnStart(messages)).toBe(3);
  });

  test("没有 HumanMessage 时退回全历史", () => {
    expect(findCurrentTurnStart([aiCall("c1", "t", {})])).toBe(0);
    expect(findCurrentTurnStart([])).toBe(0);
  });

  test("同 agent 跨轮（HITL 重放重跑）不累计到本轮", () => {
    // 第 1 轮读过 F3 两次 + 第 2 轮（重放）再读：本轮切片内只有第 2 轮的调用，
    // 不达取消阈值。
    const thread = [
      new HumanMessage({ content: "round-1" }),
      aiCall("c1", "workspace_read", { task_id: "F3_combat_design" }),
      aiCall("c2", "workspace_read", { task_id: "F3_combat_design" }),
      new HumanMessage({ content: "round-2（批准后重放）" }),
      aiCall("c3", "workspace_read", { task_id: "F3_combat_design" }),
    ];
    const sig = toolCallSignature("workspace_read", { task_id: "F3_combat_design" }, "QAPlanner");
    const priorMessages = thread.slice(0, -1);
    const turnMessages = priorMessages.slice(findCurrentTurnStart(priorMessages));
    expect(countToolCallOccurrences(turnMessages, sig, "QAPlanner")).toBe(0);
  });

  test("同 agent 本轮第 3 次同参调用达取消阈值", () => {
    const turn = [
      new HumanMessage({ content: "任务" }),
      aiCall("c1", "kb_query_table", { table: "ShopItem" }),
      aiCall("c2", "kb_query_table", { table: "ShopItem" }),
    ];
    const sig = toolCallSignature("kb_query_table", { table: "ShopItem" }, "SystemDesigner");
    expect(countToolCallOccurrences(turn, sig, "SystemDesigner")).toBe(REPEAT_CANCEL_THRESHOLD);
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
