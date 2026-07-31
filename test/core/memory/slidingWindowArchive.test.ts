import { describe, expect, test } from "vitest";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { ContextManager } from "../../../src/core/memory/ContextManager.js";
import { SlidingWindowMemoryPort } from "../../../src/core/memory/SlidingWindowMemoryPort.js";

function msg(role: "user" | "assistant" | "system", text: string) {
  return ChatMessage.text(role, role, text);
}

describe("ContextManager eviction + archive", () => {
  test("消息数超限时即使未超 token 预算也驱逐并产生归档", async () => {
    const cm = new ContextManager({
      protectRecentTurns: 3,
      maxActiveMessages: 5,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const messages = [
      msg("system", "you are helpful"),
      ...Array.from({ length: 8 }, (_, i) => msg("user", `turn-${i}`)),
    ];
    expect(cm.shouldCompress(messages)).toBe(false);
    expect(cm.shouldEvictByCount(messages)).toBe(true);

    const result = await cm.compressWithArchive(messages);
    expect(result.evicted).toBe(true);
    expect(result.archiveEntry).not.toBeNull();
    expect(result.archiveEntry!.messageCount).toBe(5);
    expect(result.archiveEntry!.summary.length).toBeGreaterThan(0);

    const activeUser = result.messages.filter((m) => m.role === "user");
    expect(activeUser).toHaveLength(3);
    expect(activeUser.map((m) => ChatMessage.textContent(m))).toEqual([
      "turn-5",
      "turn-6",
      "turn-7",
    ]);
    expect(result.messages.some((m) => m.metadata?.archiveSummary === true)).toBe(true);
  });

  test("保护最近 N 轮原文不被驱逐", async () => {
    const cm = new ContextManager({
      protectRecentTurns: 4,
      maxActiveMessages: 4,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const messages = Array.from({ length: 10 }, (_, i) => msg("user", `m-${i}`));
    const result = await cm.compressWithArchive(messages);
    const recent = result.messages.filter((m) => m.role === "user");
    expect(recent).toHaveLength(4);
    expect(recent.map((m) => ChatMessage.textContent(m))).toEqual([
      "m-6",
      "m-7",
      "m-8",
      "m-9",
    ]);
  });
});

describe("SlidingWindowMemoryPort", () => {
  test("addMessage 触发驱逐后 archive 可 list", async () => {
    const port = new SlidingWindowMemoryPort({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    for (let i = 0; i < 6; i++) {
      port.addMessage(msg("user", `u-${i}`));
    }
    await port.maybeCompress(port.getMessages());

    const archive = port.listArchive();
    expect(archive.length).toBeGreaterThanOrEqual(1);
    expect(archive[0]!.summary).toContain("u-");
    expect(port.getMessages().filter((m) => m.role === "user")).toHaveLength(2);
  });

  test("archiveEnabled=false 时不驱逐", async () => {
    const port = new SlidingWindowMemoryPort({
      archiveEnabled: false,
      protectRecentTurns: 1,
      maxActiveMessages: 2,
    });
    for (let i = 0; i < 5; i++) {
      port.addMessage(msg("user", `x-${i}`));
    }
    await port.maybeCompress(port.getMessages());
    expect(port.listArchive()).toHaveLength(0);
    expect(port.size()).toBe(5);
  });
});
