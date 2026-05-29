import { describe, it, expect } from "vitest";
import { MockModelAdapter } from "../../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentAdapter } from "../../../src/adapter/mock/MockAgentAdapter.js";
import { MockToolAdapter } from "../../../src/adapter/mock/MockToolAdapter.js";
import { MockHumanReviewGateway } from "../../../src/adapter/mock/MockHumanReviewGateway.js";
import { InMemoryMemoryPort } from "../../../src/core/memory/InMemoryMemoryPort.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";

describe("Mock Adapters", () => {
  it("MockModelAdapter 应返回预设响应", async () => {
    const adapter = new MockModelAdapter([ChatMessage.text("assistant", "mock", "Hello")]);
    const response = await adapter.generate([]);
    expect(response.message.content[0].type === "text" ? response.message.content[0].text : "").toBe("Hello");
    expect(adapter.getModelName()).toBe("mock-model");
  });

  it("MockAgentAdapter 应返回预设 AgentResponse", async () => {
    const descriptor = { name: "Test", systemPrompt: "", maxIterations: 5, toolNames: [], options: {} };
    const adapter = new MockAgentAdapter(descriptor);
    const response = await adapter.process("sid", []);
    expect(response.agentName).toBe("Test");
    expect(response.success).toBe(true);
  });

  it("MockToolAdapter 应返回预设 ToolResult", async () => {
    const descriptor = { name: "tool", description: "", parameters: {} };
    const adapter = new MockToolAdapter(descriptor, ToolResult.success("ok"));
    const result = await adapter.execute({});
    expect(result.output).toBe("ok");
  });

  it("MockHumanReviewGateway autoApprove 应返回 approved", async () => {
    const gateway = new MockHumanReviewGateway(true);
    const result = await gateway.requestReview("sid", "point", { data: "test" });
    expect(result.decision).toBe("approved");
    expect(result.modifications).toEqual({ data: "test" });
  });

  it("MockHumanReviewGateway 拒绝模式应返回 rejected", async () => {
    const gateway = new MockHumanReviewGateway(false);
    const result = await gateway.requestReview("sid", "point", {});
    expect(result.decision).toBe("rejected");
  });

  it("InMemoryMemoryPort 应存储消息", () => {
    const memory = new InMemoryMemoryPort();
    memory.addMessage(ChatMessage.text("user", "user", "Hello"));
    expect(memory.size()).toBe(1);
    expect(memory.getMessages()).toHaveLength(1);

    memory.clear();
    expect(memory.size()).toBe(0);
  });
});
