import { describe, expect, test } from "vitest";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { sanitizeToolSequence } from "../../../src/adapter/langgraph/sanitizeMessages.js";

describe("sanitizeToolSequence", () => {
  test("合法序列原样保留", () => {
    const ai = new AIMessage({
      content: "let me check",
      tool_calls: [{ id: "call_1", name: "kb_query_table", args: { table: "ShopItem" } }],
    });
    const tool = new ToolMessage({ content: "ok", tool_call_id: "call_1", name: "kb_query_table" });
    const out = sanitizeToolSequence([new SystemMessage("s"), new HumanMessage("q"), ai, tool]);
    expect(out).toHaveLength(4);
    expect(out[3]).toBeInstanceOf(ToolMessage);
  });

  test("悬空 tool 消息降级为 HumanMessage 文本（EV-058 回归）", () => {
    // tool_call 消息已被上下文压缩归档，只剩 tool 消息
    const dangling = new ToolMessage({ content: "表数据……", tool_call_id: "call_9", name: "kb_query_table" });
    const out = sanitizeToolSequence([new HumanMessage("q"), dangling]);
    expect(out).toHaveLength(2);
    expect(out[1]).toBeInstanceOf(HumanMessage);
    const text = (out[1] as HumanMessage).content as string;
    expect(text).toContain("表数据");
    expect(text).toContain("工具结果");
  });

  test("并行 tool 调用（一个 assistant 多个 tool_calls）全部保留", () => {
    const ai = new AIMessage({
      content: "",
      tool_calls: [
        { id: "c1", name: "kb_search", args: { query: "x" } },
        { id: "c2", name: "kb_search", args: { query: "y" } },
      ],
    });
    const t1 = new ToolMessage({ content: "r1", tool_call_id: "c1", name: "kb_search" });
    const t2 = new ToolMessage({ content: "r2", tool_call_id: "c2", name: "kb_search" });
    const out = sanitizeToolSequence([ai, t1, t2]);
    expect(out).toHaveLength(3);
    expect(out[1]).toBeInstanceOf(ToolMessage);
    expect(out[2]).toBeInstanceOf(ToolMessage);
  });

  test("新的 assistant 消息重置 pending 集合", () => {
    const ai1 = new AIMessage({
      content: "",
      tool_calls: [{ id: "c1", name: "kb_search", args: { query: "x" } }],
    });
    const t1 = new ToolMessage({ content: "r1", tool_call_id: "c1", name: "kb_search" });
    const ai2 = new AIMessage({ content: "answer" });
    // c2 不在任何前置 assistant tool_calls 中
    const dangling = new ToolMessage({ content: "r2", tool_call_id: "c2", name: "kb_search" });
    const out = sanitizeToolSequence([ai1, t1, ai2, dangling]);
    expect(out[3]).toBeInstanceOf(HumanMessage);
  });
});
