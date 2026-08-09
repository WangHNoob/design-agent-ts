import { describe, expect, test } from "vitest";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import type { ContentBlock } from "../../../src/port/message/ContentBlock.js";
import { ContextManager } from "../../../src/core/memory/ContextManager.js";

function user(text: string): ChatMessage {
  return ChatMessage.text("user", "user", text);
}

function aiWithTools(callIds: string[]): ChatMessage {
  const content: ContentBlock[] = [
    { type: "text", text: "" },
    ...callIds.map((id) => ({
      type: "tool_call" as const,
      callId: id,
      toolName: `tool_${id}`,
      arguments: { query: id },
    })),
  ];
  return { role: "assistant", name: "assistant", content, metadata: {} };
}

function toolResult(callId: string): ChatMessage {
  return {
    role: "tool",
    name: `tool_${callId}`,
    content: [{ type: "tool_result", callId, toolName: `tool_${callId}`, output: `result-${callId}`, isError: false }],
    metadata: {},
  };
}

/** 校验消息序列合法：每个 tool 消息前必有含对应 callId 的 assistant(tool_calls)。 */
function assertToolPairsValid(messages: ChatMessage[]): void {
  const pending = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant") {
      for (const tc of ChatMessage.toolCalls(m)) {
        pending.add(tc.callId);
      }
    } else if (m.role === "tool") {
      for (const tr of ChatMessage.toolResults(m)) {
        expect(
          pending.has(tr.callId),
          `tool result ${tr.callId} 无前置 assistant tool_calls`,
        ).toBe(true);
      }
    }
  }
}

describe("ContextManager 轮次感知驱逐", () => {
  test("归档边界不切开 assistant(tool_calls) ↔ tool 消息对（EV-058 回归）", async () => {
    const cm = new ContextManager({
      protectRecentTurns: 2,
      maxActiveMessages: 4,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });

    // 3 个轮次：ai1(+2 tools) / ai2(+1 tool) / ai3(+2 tools)
    const messages = [
      user("question"),
      aiWithTools(["a", "b"]),
      toolResult("a"),
      toolResult("b"),
      aiWithTools(["c"]),
      toolResult("c"),
      aiWithTools(["d", "e"]),
      toolResult("d"),
      toolResult("e"),
    ];

    const result = await cm.compressWithArchive(messages);
    expect(result.evicted).toBe(true);

    // 保留最近 2 个轮次：ai2/c 与 ai3/d,e —— 消息对必须完整
    assertToolPairsValid(result.messages);

    const keptText = result.messages.map((m) => {
      if (m.role === "assistant") return `ai[${ChatMessage.toolCalls(m).map((t) => t.callId).join(",")}]`;
      if (m.role === "tool") return `tool(${ChatMessage.toolResults(m)[0]!.callId})`;
      return m.role;
    }).join(" ");
    expect(keptText).toContain("ai[c] tool(c)");
    expect(keptText).toContain("ai[d,e] tool(d) tool(e)");
    // ai1 的整个轮次被归档（含其 tool 消息），不是只归档 ai 而留下悬空 tool
    expect(keptText).not.toContain("tool(a)");
    expect(keptText).not.toContain("tool(b)");
  });

  test("悬空的 tool 消息（前置轮次已被归档）自成一个轮次，不吞并后续消息", async () => {
    const cm = new ContextManager({
      protectRecentTurns: 1,
      maxActiveMessages: 2,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });

    // 模拟历史损坏：tool(a) 的 assistant 已被之前的归档移除
    const messages = [toolResult("a"), aiWithTools(["b"]), toolResult("b"), user("q")];

    const result = await cm.compressWithArchive(messages);
    // 不应抛错；归档后可保留的消息序列仍合法（悬空 tool 会随最近窗口保留，由
    // 发送前 sanitizeToolSequence 兜底降级，见 adapter 层测试）
    expect(result.evicted).toBe(true);
    assertToolPairsValid(result.messages.filter((m) => m.role !== "tool" || true));
  });

  test("token 超限触发压缩时同样按轮次归档", async () => {
    const cm = new ContextManager({
      protectRecentTurns: 2,
      maxActiveMessages: 100,
      maxTokens: 600,
      compressionThreshold: 0.5,
    });

    const long = "x".repeat(400);
    const messages = [
      aiWithTools(["a", "b"]),
      toolResult("a"),
      toolResult("b"),
      user(long), // 大块文本使 token 估算超阈值（≈406 > 600×0.5=300）
      aiWithTools(["c"]),
      toolResult("c"),
    ];

    expect(cm.shouldCompress(messages)).toBe(true);
    const result = await cm.compressWithArchive(messages);
    expect(result.evicted).toBe(true);
    assertToolPairsValid(result.messages);
  });
});
