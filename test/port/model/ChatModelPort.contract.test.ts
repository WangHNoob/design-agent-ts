import { describe, it, expectTypeOf } from "vitest";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort";
import type { ModelOptions } from "../../../src/port/model/ModelOptions";
import type { ModelResponse } from "../../../src/port/model/ModelResponse";
import type { ChatMessage } from "../../../src/port/message/ChatMessage";

describe("ChatModelPort 契约测试", () => {
  it("ChatModelPort 接口应有正确的方法签名", () => {
    expectTypeOf<ChatModelPort>().toHaveProperty("generate").toBeFunction();
    expectTypeOf<ChatModelPort>().toHaveProperty("stream").toBeFunction();
    expectTypeOf<ChatModelPort>().toHaveProperty("getModelName").toBeFunction();
    expectTypeOf<ChatModelPort>().toHaveProperty("getProvider").toBeFunction();
  });

  it("ModelOptions 应有正确的字段", () => {
    expectTypeOf<ModelOptions>().toHaveProperty("maxTokens").toEqualTypeOf<number | undefined>();
    expectTypeOf<ModelOptions>().toHaveProperty("temperature").toEqualTypeOf<number | undefined>();
  });

  it("ModelResponse 应有正确的字段", () => {
    expectTypeOf<ModelResponse>().toHaveProperty("message").toEqualTypeOf<ChatMessage>();
    expectTypeOf<ModelResponse>().toHaveProperty("inputTokenCount").toBeNumber();
    expectTypeOf<ModelResponse>().toHaveProperty("outputTokenCount").toBeNumber();
    expectTypeOf<ModelResponse>().toHaveProperty("finishReason").toEqualTypeOf<string | null>();
  });
});
