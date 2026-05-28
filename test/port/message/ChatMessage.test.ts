import { describe, it, expect } from "vitest";
import { ChatMessage } from "../../../src/port/message/ChatMessage";
import type { TextContent } from "../../../src/port/message/ContentBlock";

describe("ChatMessage", () => {
  describe("text() 工厂方法", () => {
    it("应创建包含文本内容的消息", () => {
      const msg = ChatMessage.text("user", "test-user", "Hello");
      expect(msg.role).toBe("user");
      expect(msg.name).toBe("test-user");
      expect(msg.content).toHaveLength(1);
      expect((msg.content[0] as TextContent).text).toBe("Hello");
    });
  });

  describe("textContent()", () => {
    it("应提取所有文本内容", () => {
      const msg: import("../../../src/port/message/ChatMessage").ChatMessage = {
        role: "assistant",
        name: "bot",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "World" },
        ],
        metadata: {},
      };
      expect(ChatMessage.textContent(msg)).toBe("Hello World");
    });

    it("空内容应返回空字符串", () => {
      const msg: import("../../../src/port/message/ChatMessage").ChatMessage = {
        role: "assistant",
        content: [],
        metadata: {},
      };
      expect(ChatMessage.textContent(msg)).toBe("");
    });
  });

  describe("toolCalls()", () => {
    it("应过滤出 tool_call 内容", () => {
      const msg: import("../../../src/port/message/ChatMessage").ChatMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check" },
          { type: "tool_call", callId: "1", toolName: "wiki_read", arguments: { path: "test" } },
        ],
        metadata: {},
      };
      const calls = ChatMessage.toolCalls(msg);
      expect(calls).toHaveLength(1);
      expect(calls[0].toolName).toBe("wiki_read");
    });
  });

  describe("toolResults()", () => {
    it("应过滤出 tool_result 内容", () => {
      const msg: import("../../../src/port/message/ChatMessage").ChatMessage = {
        role: "tool",
        content: [
          { type: "tool_result", callId: "1", toolName: "wiki_read", output: "result", isError: false },
        ],
        metadata: {},
      };
      const results = ChatMessage.toolResults(msg);
      expect(results).toHaveLength(1);
      expect(results[0].output).toBe("result");
    });
  });

  describe("discriminated union 类型窄化", () => {
    it("应正确窄化到 TextContent", () => {
      const block: import("../../../src/port/message/ContentBlock").ContentBlock = { type: "text", text: "test" };
      if (block.type === "text") {
        expect(block.text).toBe("test");
      } else {
        expect.fail("类型窄化失败");
      }
    });

    it("应正确窄化到 ToolCallContent", () => {
      const block: import("../../../src/port/message/ContentBlock").ContentBlock = {
        type: "tool_call",
        callId: "1",
        toolName: "test",
        arguments: {},
      };
      if (block.type === "tool_call") {
        expect(block.toolName).toBe("test");
      } else {
        expect.fail("类型窄化失败");
      }
    });
  });
});
