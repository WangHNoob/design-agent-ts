import { describe, expect, it, vi } from "vitest";
import { LLMSummarizerAdapter } from "../../../src/adapter/llm/LLMSummarizerAdapter.js";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";

function mockModel(respond: (messages: ChatMessage[], options?: { maxTokens?: number }) => string): ChatModelPort {
  return {
    generate: vi.fn(async (messages: ChatMessage[], options?: { maxTokens?: number }) => {
      const text = respond(messages, options);
      return {
        message: ChatMessage.text("assistant", "mock", text),
        inputTokenCount: 10,
        outputTokenCount: 20,
        finishReason: "stop",
      };
    }),
    stream: vi.fn(),
    getModelName: () => "mock-model",
    getProvider: () => "mock",
  };
}

describe("LLMSummarizerAdapter", () => {
  it("assembles transcript from messages and calls model.generate", async () => {
    let seen = "";
    const model = mockModel((messages) => {
      seen = ChatMessage.textContent(messages[messages.length - 1]!);
      return "## 要点\n- 用户询问伤害公式\n## 决策\n- 采用乘区公式\n## 遗留项\n- 无";
    });
    const summarizer = new LLMSummarizerAdapter(model, { maxOutputTokens: 300 });

    const result = await summarizer.summarize([
      ChatMessage.text("user", "user", "伤害公式是什么？"),
      ChatMessage.text("assistant", "assistant", "攻击力 × 技能倍率"),
    ]);

    expect(result).toContain("## 要点");
    expect(result).toContain("乘区公式");
    expect(seen).toContain("伤害公式是什么？");
    expect(seen).toContain("攻击力 × 技能倍率");
    expect(model.generate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ maxTokens: 300 }),
    );
  });

  it("falls back to truncated transcript when the model returns empty output", async () => {
    const model = mockModel(() => "   ");
    const summarizer = new LLMSummarizerAdapter(model);

    const result = await summarizer.summarize([
      ChatMessage.text("user", "user", "内容甲"),
      ChatMessage.text("assistant", "assistant", "内容乙"),
    ]);

    expect(result).toContain("内容甲");
    expect(result).toContain("内容乙");
  });

  it("truncates long transcripts to the input budget", async () => {
    const model = mockModel(() => "ok");
    const summarizer = new LLMSummarizerAdapter(model, { maxInputChars: 120 });

    const result = await summarizer.summarize([
      ChatMessage.text("user", "user", "x".repeat(500)),
      ChatMessage.text("assistant", "assistant", "y".repeat(500)),
    ]);

    expect(result).toBe("ok");
    const seen = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ChatMessage[];
    const userText = ChatMessage.textContent(seen[seen.length - 1]!);
    expect(userText.length).toBeLessThan(300);
  });
});
