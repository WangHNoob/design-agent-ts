import { describe, it, expect, vi } from "vitest";
import { IntentClassifier } from "../../../../src/core/agent/director/IntentClassifier.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";

const PROMPT = "分类规则（测试用）";

function mockModel(reply: string | Promise<never>): ChatModelPort & { generate: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn().mockImplementation(
      typeof reply === "string"
        ? async () => ({
            message: ChatMessage.text("assistant", "m", reply),
            inputTokenCount: 10,
            outputTokenCount: 2,
            finishReason: "stop",
          })
        : reply,
    ),
    stream: vi.fn(),
    getModelName: () => "mock-model",
    getProvider: () => "mock",
  } as never;
}

const history10 = Array.from({ length: 10 }, (_, i) => ({
  role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
  content: `m${i}`,
}));

describe("IntentClassifier", () => {
  it("chat JSON → chat", async () => {
    const model = mockModel('{"intent": "chat"}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await expect(c.classify("你好")).resolves.toBe("chat");
  });

  it("intent 大小写不敏感（CHAT → chat）", async () => {
    const model = mockModel('{"intent": "CHAT"}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await expect(c.classify("谢谢")).resolves.toBe("chat");
  });

  it("task JSON → task", async () => {
    const model = mockModel('{"intent": "task"}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await expect(c.classify("设计一个战斗系统")).resolves.toBe("task");
  });

  it("非 chat 的值一律 task（schema 层 fail-safe）", async () => {
    const model = mockModel('{"intent": "闲聊"}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await expect(c.classify("在吗")).resolves.toBe("task");
  });

  it("缺 intent 字段也归 task，不触发降级", async () => {
    const model = mockModel('{"foo": 1}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await expect(c.classify("在吗")).resolves.toBe("task");
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it("非 JSON 输出重试 1 次后降级 → task", async () => {
    const model = mockModel("我觉得这是闲聊，不需要 JSON");
    const c = new IntentClassifier(model, { prompt: PROMPT, timeoutMs: 2000 });
    await expect(c.classify("你好")).resolves.toBe("task");
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it("超时 → task", async () => {
    const never = new Promise<never>(() => {});
    const model = {
      generate: vi.fn(() => never),
      stream: vi.fn(),
      getModelName: () => "mock",
      getProvider: () => "mock",
    } as unknown as ChatModelPort & { generate: ReturnType<typeof vi.fn> };
    const c = new IntentClassifier(model, { prompt: PROMPT, timeoutMs: 30 });
    const result = await c.classifyWithTrace("你好");
    expect(result.intent).toBe("task");
    expect(result.degraded).toBe(true);
    expect(result.latencyMs).toBeLessThan(2000);
  });

  it("模型抛错 → task（异常不外溢）", async () => {
    const model = {
      generate: vi.fn().mockRejectedValue(new Error("boom")),
      stream: vi.fn(),
      getModelName: () => "mock",
      getProvider: () => "mock",
    } as never;
    const c = new IntentClassifier(model, { prompt: PROMPT, timeoutMs: 500 });
    await expect(c.classify("你好")).resolves.toBe("task");
  });

  it("超过 maxCheckChars 直接判 task，不调用模型", async () => {
    const model = mockModel('{"intent": "chat"}');
    const c = new IntentClassifier(model, { prompt: PROMPT, maxCheckChars: 10 });
    const result = await c.classifyWithTrace("x".repeat(11));
    expect(result.intent).toBe("task");
    expect(result.skipped).toBe("disabled_length");
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("历史按 maxHistoryTurns 截断，只保留最近几条", async () => {
    const model = mockModel('{"intent": "chat"}');
    const c = new IntentClassifier(model, { prompt: PROMPT, maxHistoryTurns: 4 });
    await c.classify("继续", history10);
    const called = model.generate.mock.calls[0]?.[0] as ReturnType<typeof ChatMessage.text>[];
    const userMsg = called[1];
    const text = ChatMessage.textContent(userMsg);
    expect(text).toContain("m6");
    expect(text).not.toContain("m2\n");
    expect(text).not.toContain("用户: m0");
  });

  it("无历史时不包含对话历史段", async () => {
    const model = mockModel('{"intent": "chat"}');
    const c = new IntentClassifier(model, { prompt: PROMPT });
    await c.classify("你好");
    const called = model.generate.mock.calls[0]?.[0] as ReturnType<typeof ChatMessage.text>[];
    const text = ChatMessage.textContent(called[1]);
    expect(text).not.toContain("[对话历史]");
    expect(text).toContain("[最新消息]");
  });
});
