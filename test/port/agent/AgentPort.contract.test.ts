import { describe, it, expectTypeOf } from "vitest";
import type { AgentPort } from "../../../src/port/agent/AgentPort";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor";
import type { AgentResponse } from "../../../src/port/agent/AgentResponse";
import type { ChatMessage } from "../../../src/port/message/ChatMessage";

describe("AgentPort 契约测试", () => {
  it("AgentPort 接口应有正确的方法签名", () => {
    expectTypeOf<AgentPort>().toHaveProperty("getDescriptor").toBeFunction();
    expectTypeOf<AgentPort>().toHaveProperty("process").toBeFunction();
    expectTypeOf<AgentPort>().toHaveProperty("getName").toBeFunction();
  });

  it("AgentDescriptor 应有正确的字段", () => {
    expectTypeOf<AgentDescriptor>().toHaveProperty("name").toBeString();
    expectTypeOf<AgentDescriptor>().toHaveProperty("systemPrompt").toBeString();
    expectTypeOf<AgentDescriptor>().toHaveProperty("maxIterations").toBeNumber();
    expectTypeOf<AgentDescriptor>().toHaveProperty("toolNames").toBeArray();
    expectTypeOf<AgentDescriptor>().toHaveProperty("options").toBeObject();
  });

  it("AgentResponse 应有正确的字段", () => {
    expectTypeOf<AgentResponse>().toHaveProperty("agentName").toBeString();
    expectTypeOf<AgentResponse>().toHaveProperty("message").toEqualTypeOf<ChatMessage | null>();
    expectTypeOf<AgentResponse>().toHaveProperty("metadata").toBeObject();
    expectTypeOf<AgentResponse>().toHaveProperty("success").toBeBoolean();
    expectTypeOf<AgentResponse>().toHaveProperty("errorMessage").toEqualTypeOf<string | null>();
  });
});
