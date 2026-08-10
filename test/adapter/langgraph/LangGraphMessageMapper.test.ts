import { describe, it, expect } from "vitest";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { LangGraphMessageMapper } from "../../../src/adapter/langgraph/LangGraphMessageMapper.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";

describe("LangGraphMessageMapper", () => {
  const mapper = new LangGraphMessageMapper();

  describe("toLangGraph / fromLangGraph 双向转换", () => {
    it("文本消息 round-trip 应保持一致", () => {
      const original = ChatMessage.text("user", "test", "Hello world");
      const lg = mapper.toLangGraph(original);
      const back = mapper.fromLangGraph(lg);

      expect(back.role).toBe("user");
      expect(back.name).toBe("test");
      expect(ChatMessage.textContent(back)).toBe("Hello world");
    });

    it("system 消息应转换为 SystemMessage", () => {
      const msg = ChatMessage.text("system", "system", "You are a helper");
      const lg = mapper.toLangGraph(msg);
      expect(lg).toBeInstanceOf(SystemMessage);
    });

    it("assistant 消息应转换为 AIMessage", () => {
      const msg = ChatMessage.text("assistant", "bot", "Hi there");
      const lg = mapper.toLangGraph(msg);
      expect(lg).toBeInstanceOf(AIMessage);
    });

    it("user 消息应转换为 HumanMessage", () => {
      const msg = ChatMessage.text("user", "user", "Question");
      const lg = mapper.toLangGraph(msg);
      expect(lg).toBeInstanceOf(HumanMessage);
    });
  });

  describe("ToolCallContent 转换", () => {
    it("ToolCallContent 应转换为 AIMessage.tool_calls", () => {
      const msg: import("../../../src/port/message/ChatMessage.js").ChatMessage = {
        role: "assistant",
        name: "bot",
        content: [
          { type: "text", text: "Let me check" },
          { type: "tool_call", callId: "call_1", toolName: "wiki_read", arguments: { path: "combat.md" } },
        ],
        metadata: {},
      };
      const lg = mapper.toLangGraph(msg) as AIMessage;
      expect(lg.tool_calls).toHaveLength(1);
      expect(lg.tool_calls?.[0].name).toBe("wiki_read");
    });

    it("fromLangGraph 应提取 tool_calls", () => {
      const lg = new AIMessage({
        content: "Using tool",
        tool_calls: [{ id: "call_1", name: "wiki_read", args: { path: "test.md" } }],
      });
      const msg = mapper.fromLangGraph(lg);
      const calls = ChatMessage.toolCalls(msg);
      expect(calls).toHaveLength(1);
      expect(calls[0].callId).toBe("call_1");
      expect(calls[0].toolName).toBe("wiki_read");
    });
  });

  describe("ToolResultContent 转换", () => {
    it("单个 ToolResult 应转换为 ToolMessage", () => {
      const msg: import("../../../src/port/message/ChatMessage.js").ChatMessage = {
        role: "tool",
        name: "wiki_read",
        content: [
          { type: "tool_result", callId: "call_1", toolName: "wiki_read", output: "result data", isError: false },
        ],
        metadata: {},
      };
      const lg = mapper.toLangGraph(msg) as ToolMessage;
      expect(lg).toBeInstanceOf(ToolMessage);
      expect(lg.tool_call_id).toBe("call_1");
      expect(lg.content).toBe("result data");
    });

    it("fromLangGraph ToolMessage 应转换为 ToolResultContent", () => {
      const lg = new ToolMessage({ content: "output", tool_call_id: "call_1", name: "wiki_read" });
      const msg = mapper.fromLangGraph(lg);
      const results = ChatMessage.toolResults(msg);
      expect(results).toHaveLength(1);
      expect(results[0].output).toBe("output");
    });
  });

  describe("边界情况", () => {
    it("B1: AIMessage 同时含文本和 tool_calls 应共存", () => {
      const lg = new AIMessage({
        content: "Here's the result",
        tool_calls: [{ id: "c1", name: "tool", args: {} }],
      });
      const msg = mapper.fromLangGraph(lg);
      const text = ChatMessage.textContent(msg);
      const calls = ChatMessage.toolCalls(msg);
      expect(text).toBe("Here's the result");
      expect(calls).toHaveLength(1);
    });

    it("B2: ToolMessage.content 非字符串应 JSON.stringify 兜底", () => {
      const lg = new ToolMessage({
        content: { key: "value" } as unknown as string,
        tool_call_id: "c1",
        name: "tool",
      });
      const msg = mapper.fromLangGraph(lg);
      const results = ChatMessage.toolResults(msg);
      expect(results[0].output).toBe('{"key":"value"}');
    });

    it("B3: tool_calls 的 id 为空应使用空字符串兜底", () => {
      const lg = new AIMessage({
        content: "",
        tool_calls: [{ id: "", name: "tool", args: {} }],
      });
      const msg = mapper.fromLangGraph(lg);
      const calls = ChatMessage.toolCalls(msg);
      expect(calls[0].callId).toBe("");
    });

    it("B4: 多个 ToolResultContent 在一条 ChatMessage 中应序列化", () => {
      const msg: import("../../../src/port/message/ChatMessage.js").ChatMessage = {
        role: "tool",
        content: [
          { type: "tool_result", callId: "c1", toolName: "t1", output: "r1", isError: false },
          { type: "tool_result", callId: "c2", toolName: "t2", output: "r2", isError: false },
        ],
        metadata: {},
      };
      const lg = mapper.toLangGraph(msg) as ToolMessage;
      expect(lg.content).toContain("r1");
      expect(lg.content).toContain("r2");
    });
  });

  describe("列表转换", () => {
    it("toLangGraphList 应转换消息数组", () => {
      const messages = [
        ChatMessage.text("system", "system", "Sys"),
        ChatMessage.text("user", "user", "Hello"),
      ];
      const lgList = mapper.toLangGraphList(messages);
      expect(lgList).toHaveLength(2);
      expect(lgList[0]).toBeInstanceOf(SystemMessage);
      expect(lgList[1]).toBeInstanceOf(HumanMessage);
    });

    it("fromLangGraphList 应转换 BaseMessage 数组", () => {
      const lgList = [
        new SystemMessage({ content: "Sys" }),
        new HumanMessage({ content: "Hello" }),
      ];
      const messages = mapper.fromLangGraphList(lgList);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
    });
  });

  describe("reasoning_content 往返保真（P0：EV-021/058 thinking 模型 400）", () => {
    it("AIMessage 的 reasoning_content 经 round-trip 必须保留在 additional_kwargs", () => {
      const lg = new AIMessage({
        content: "结论文本",
        additional_kwargs: { reasoning_content: "模型内部思考过程" },
      });
      const chat = mapper.fromLangGraph(lg);
      expect(chat.metadata).toMatchObject({ reasoning_content: "模型内部思考过程" });

      const back = mapper.toLangGraph(chat) as AIMessage;
      expect(back.additional_kwargs).toMatchObject({ reasoning_content: "模型内部思考过程" });
    });

    it("带 tool_calls 的 AIMessage 同样保留 reasoning_content", () => {
      const lg = new AIMessage({
        content: "先查一下",
        tool_calls: [{ id: "call_x", name: "kb_query_table", args: { table: "Skill" } }],
        additional_kwargs: { reasoning_content: "需要先查表" },
      });
      const chat = mapper.fromLangGraph(lg);
      const back = mapper.toLangGraph(chat) as AIMessage;
      expect(back.tool_calls).toHaveLength(1);
      expect(back.additional_kwargs).toMatchObject({ reasoning_content: "需要先查表" });
    });

    it("无 reasoning_content 的消息不受影响（metadata 为空对象）", () => {
      const lg = new AIMessage({ content: "普通回复" });
      const chat = mapper.fromLangGraph(lg);
      const back = mapper.toLangGraph(chat) as AIMessage;
      expect(back.additional_kwargs).toEqual({});
    });
  });
});
