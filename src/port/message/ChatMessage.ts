import type { MessageRole } from "./MessageRole.js";
import type { ContentBlock, TextContent, ToolCallContent, ToolResultContent } from "./ContentBlock.js";

export interface ChatMessage {
  readonly role: MessageRole;
  readonly name?: string;
  readonly content: ContentBlock[];
  readonly metadata: Record<string, unknown>;
}

export namespace ChatMessage {
  export function text(role: MessageRole, name: string, text: string): ChatMessage {
    return { role, name, content: [{ type: "text", text }], metadata: {} };
  }

  export function textContent(msg: ChatMessage): string {
    return msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("");
  }

  export function toolCalls(msg: ChatMessage): ToolCallContent[] {
    return msg.content.filter((c): c is ToolCallContent => c.type === "tool_call");
  }

  export function toolResults(msg: ChatMessage): ToolResultContent[] {
    return msg.content.filter((c): c is ToolResultContent => c.type === "tool_result");
  }
}
