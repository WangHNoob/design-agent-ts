import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import type { ModelResponse } from "../../../src/port/model/ModelResponse.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import {
  StructuredParseError,
  StructuredExhaustedError,
  parseJsonWithSchema,
  generateStructured,
  TaskPlanSchema,
} from "../../../src/core/structured/index.js";

function modelResponse(text: string): ModelResponse {
  return {
    message: ChatMessage.text("assistant", "model", text),
    inputTokenCount: 1,
    outputTokenCount: 1,
    finishReason: "stop",
  };
}

function mockModel(outputs: string[]): ChatModelPort {
  let i = 0;
  return {
    async generate() {
      const text = outputs[Math.min(i, outputs.length - 1)]!;
      i += 1;
      return modelResponse(text);
    },
    async *stream() {
      yield modelResponse(outputs[0] ?? "");
    },
    getModelName: () => "mock",
    getProvider: () => "mock",
    reconfigure: () => {},
  };
}

describe("parseJsonWithSchema", () => {
  test("accepts valid JSON object", () => {
    const schema = z.object({ a: z.number() });
    expect(parseJsonWithSchema('{"a":1}', schema)).toEqual({ a: 1 });
  });

  test("rejects invalid JSON with concrete issue", () => {
    const schema = z.object({ a: z.number() });
    expect(() => parseJsonWithSchema("not-json", schema)).toThrow(StructuredParseError);
    try {
      parseJsonWithSchema("not-json", schema);
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredParseError);
      expect((err as StructuredParseError).issues[0]).toMatch(/JSON parse failed/);
    }
  });

  test("rejects schema mismatch with path issues", () => {
    const schema = z.object({ a: z.number() });
    try {
      parseJsonWithSchema('{"a":"x"}', schema);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredParseError);
      expect((err as StructuredParseError).issues.some((i) => i.includes("a"))).toBe(true);
    }
  });
});

describe("generateStructured", () => {
  test("passes on first valid output", async () => {
    const model = mockModel(['{"planId":"p1","subTasks":[{"id":"T1","domain":"system_design","description":"do it"}]}']);
    const result = await generateStructured(
      model,
      [ChatMessage.text("user", "u", "plan")],
      TaskPlanSchema,
    );
    expect(result.degraded).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.value.subTasks).toHaveLength(1);
  });

  test("retries with issue feedback then succeeds", async () => {
    const model = mockModel([
      "not json",
      '{"planId":"p1","subTasks":[{"id":"T1","domain":"system_design","description":"ok"}]}',
    ]);
    const generate = vi.spyOn(model, "generate");
    const result = await generateStructured(
      model,
      [ChatMessage.text("user", "u", "plan")],
      TaskPlanSchema,
      { maxRetries: 2 },
    );
    expect(result.degraded).toBe(false);
    expect(result.attempts).toBe(2);
    expect(generate).toHaveBeenCalledTimes(2);
    const secondMsgs = generate.mock.calls[1]![0] as ChatMessage[];
    const feedback = ChatMessage.textContent(secondMsgs[secondMsgs.length - 1]!);
    expect(feedback).toMatch(/上次输出无法通过校验/);
  });

  test("degrades when exhausted", async () => {
    const model = mockModel(["bad", "still bad", "nope"]);
    const result = await generateStructured(
      model,
      [ChatMessage.text("user", "u", "plan")],
      TaskPlanSchema,
      {
        maxRetries: 2,
        onExhausted: "degrade",
        degradeValue: {
          planId: "fallback",
          subTasks: [
            {
              id: "T1",
              fragmentId: "T1",
              domain: "system_design" as const,
              description: "fallback",
              dependencies: [],
              priority: 1,
            },
          ],
        },
      },
    );
    expect(result.degraded).toBe(true);
    expect(result.value.planId).toBe("fallback");
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  test("throws StructuredExhaustedError when onExhausted=throw", async () => {
    const model = mockModel(["{}", "{}", "{}"]);
    await expect(
      generateStructured(
        model,
        [ChatMessage.text("user", "u", "plan")],
        TaskPlanSchema,
        { maxRetries: 1, onExhausted: "throw" },
      ),
    ).rejects.toBeInstanceOf(StructuredExhaustedError);
  });
});
