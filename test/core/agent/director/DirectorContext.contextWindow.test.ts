import { describe, expect, test } from "vitest";
import { DirectorContext } from "../../../../src/core/agent/director/DirectorContext.js";
import type { DirectorDeps } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { LoggerPort } from "../../../../src/port/infra/LoggerPort.js";
import type { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../../../src/port/message/ChatMessage.js";

/** 构造约 chars 字符的单条用户消息 */
function longMessage(chars: number, i: number): ChatMessage {
  return CM.text("user", "user", `msg-${i}:${"上下文字符".repeat(Math.ceil(chars / 5))}`);
}

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as LoggerPort;

function makeDeps(memory: DirectorDeps["memory"]): DirectorDeps {
  return {
    model: {} as DirectorDeps["model"],
    agentFactory: {} as DirectorDeps["agentFactory"],
    toolRegistry: {} as DirectorDeps["toolRegistry"],
    skillRegistry: {} as DirectorDeps["skillRegistry"],
    logger: noopLogger,
    hooks: [],
    memory,
  } as unknown as DirectorDeps;
}

describe("DirectorContext.createMemoryPort 上下文窗口钳制", () => {
  test("contextWindow 小于全局 maxTokens 时，压缩按窗口×阈值提前触发", async () => {
    const ctx = new DirectorContext(
      makeDeps({
        maxTokens: 200_000,
        compressionThreshold: 0.8,
        protectRecentTurns: 1,
        maxActiveMessages: 50,
        contextWindow: () => 1_000, // 有效预算 = 0.8 × 1000 = 800 tokens
      }),
      noopLogger,
    );
    const port = await ctx.createMemoryPort();

    // ~4000 字符 ≈ 1050 估算 tokens > 800 → 应触发压缩（归档摘要回注）
    const messages = [longMessage(2_000, 1), longMessage(2_000, 2)];
    const result = await port.maybeCompress(messages);
    expect(result.some((m) => m.metadata?.archiveSummary === true)).toBe(true);
  });

  test("无 contextWindow 解析器时按原 maxTokens 生效（小转录不压缩）", async () => {
    const ctx = new DirectorContext(
      makeDeps({
        maxTokens: 200_000,
        compressionThreshold: 0.8,
        protectRecentTurns: 1,
        maxActiveMessages: 50,
      }),
      noopLogger,
    );
    const port = await ctx.createMemoryPort();
    const messages = [longMessage(2_000, 1), longMessage(2_000, 2)];
    const result = await port.maybeCompress(messages);
    // 0.8 × 200000 = 160k tokens，远未触发
    expect(result.some((m) => m.metadata?.archiveSummary === true)).toBe(false);
  });
});
