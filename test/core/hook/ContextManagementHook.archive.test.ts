import { describe, expect, test } from "vitest";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";
import { ContextManagementHook } from "../../../src/core/hook/ContextManagementHook.js";
import { SlidingWindowMemoryPort } from "../../../src/core/memory/SlidingWindowMemoryPort.js";

function msg(role: "user" | "assistant" | "system", text: string) {
  return ChatMessage.text(role, role, text);
}

describe("ContextManagementHook archive", () => {
  test("驱逐后 listArchive().length >= 1（内置 ContextManager 路径）", async () => {
    const hook = new ContextManagementHook({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const messages = Array.from({ length: 8 }, (_, i) => msg("user", `h-${i}`));
    const ctx = await hook.onEvent(
      "pre_reasoning",
      HookContext.create({ agentName: "t", sessionId: "s", messages }),
    );
    expect(ctx.messages!.filter((m) => m.role === "user")).toHaveLength(2);
    expect(hook.listArchive().length).toBeGreaterThanOrEqual(1);
  });

  test("注入 MemoryPort 时归档可经 hook.listArchive / memory.listArchive 查询", async () => {
    const memory = new SlidingWindowMemoryPort({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const hook = new ContextManagementHook({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
      memory,
    });
    const messages = Array.from({ length: 8 }, (_, i) => msg("user", `m-${i}`));
    await hook.onEvent(
      "pre_reasoning",
      HookContext.create({ agentName: "t", sessionId: "s", messages }),
    );
    expect(hook.listArchive().length).toBeGreaterThanOrEqual(1);
    expect(memory.listArchive().length).toBeGreaterThanOrEqual(1);
    expect(hook.listArchive()[0]!.id).toBe(memory.listArchive()[0]!.id);
  });

  test("withMemory 不污染原 hook 实例", async () => {
    const shared = new ContextManagementHook({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const memory = new SlidingWindowMemoryPort({
      protectRecentTurns: 2,
      maxActiveMessages: 3,
      maxTokens: 1_000_000,
      compressionThreshold: 0.99,
    });
    const bound = shared.withMemory(memory);
    const messages = Array.from({ length: 8 }, (_, i) => msg("user", `x-${i}`));
    await bound.onEvent(
      "pre_reasoning",
      HookContext.create({ agentName: "t", sessionId: "s", messages }),
    );
    expect(bound.listArchive().length).toBeGreaterThanOrEqual(1);
    expect(shared.listArchive()).toHaveLength(0);
  });
});
