import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import type { ContentBlock, TextContent, ToolCallContent, ToolResultContent } from "../../port/message/ContentBlock.js";
import type { MessageRole } from "../../port/message/MessageRole.js";

export class LangGraphMessageMapper {
  toLangGraph(msg: ChatMessage): BaseMessage {
    const textParts = msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const toolCalls = msg.content
      .filter((c): c is ToolCallContent => c.type === "tool_call")
      .map((c) => ({
        id: c.callId,
        name: c.toolName,
        args: c.arguments,
      }));

    // 往返保真：fromLangGraph 把 additional_kwargs（含 thinking 模型的
    // reasoning_content）存进 metadata，这里必须原样带回，否则 Console Go
    // 类 thinking provider 会 400 拒绝（评测 EV-021/058 实证）。
    const additionalKwargs: Record<string, unknown> = msg.metadata ?? {};

    switch (msg.role) {
      case "system":
        return new SystemMessage({ content: textParts, additional_kwargs: additionalKwargs });
      case "user":
        return new HumanMessage({ content: textParts, name: msg.name, additional_kwargs: additionalKwargs });
      case "assistant": {
        if (toolCalls.length > 0) {
          return new AIMessage({ content: textParts || "", tool_calls: toolCalls, name: msg.name, additional_kwargs: additionalKwargs });
        }
        return new AIMessage({ content: textParts, name: msg.name, additional_kwargs: additionalKwargs });
      }
      case "tool": {
        const results = msg.content.filter((c): c is ToolResultContent => c.type === "tool_result");
        if (results.length === 1) {
          const first = results[0]!;
          return new ToolMessage({
            content: first.output,
            tool_call_id: first.callId,
            name: first.toolName,
            additional_kwargs: additionalKwargs,
          });
        }
        return new ToolMessage({
          content: JSON.stringify(results.map((r) => ({ callId: r.callId, output: r.output }))),
          tool_call_id: results[0]?.callId ?? "unknown",
          name: msg.name ?? "tool",
          additional_kwargs: additionalKwargs,
        });
      }
    }
  }

  fromLangGraph(msg: BaseMessage): ChatMessage {
    const content: ContentBlock[] = [];

    // Handle both string content (OpenAI-style) and array content (Anthropic-style)
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Anthropic Claude may return content as an array of blocks,
      // e.g. [{ type: "text", text: "..." }, { type: "thinking", thinking: "..." }]
      text = msg.content
        .filter((block: unknown): block is { type: string; text?: string } =>
          typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "text"
        )
        .map((block) => block.text ?? "")
        .join("");
    }
    if (text) {
      content.push({ type: "text", text });
    }

    const toolCalls = (msg as AIMessage).tool_calls;
    if (toolCalls && Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc) continue;
        content.push({
          type: "tool_call",
          callId: tc.id ?? "",
          toolName: tc.name,
          arguments: tc.args as Record<string, unknown>,
        });
      }
    }

    if (msg instanceof ToolMessage) {
      content.push({
        type: "tool_result",
        callId: msg.tool_call_id ?? "",
        toolName: msg.name ?? "",
        output: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        isError: false,
      });
    }

    const roleMap: Record<string, MessageRole> = {
      system: "system",
      human: "user",
      ai: "assistant",
      tool: "tool",
    };

    return {
      role: roleMap[msg._getType()] ?? "user",
      name: msg.name ?? undefined,
      content,
      metadata: msg.additional_kwargs ?? {},
    };
  }

  toLangGraphList(messages: ChatMessage[]): BaseMessage[] {
    return messages.map((m) => this.toLangGraph(m));
  }

  fromLangGraphList(messages: BaseMessage[]): ChatMessage[] {
    return messages.map((m) => this.fromLangGraph(m));
  }
}
