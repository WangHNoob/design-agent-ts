import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";

export class ContextManagementHook implements AgentHook {
  priority = 80;

  constructor(
    private readonly compressionThreshold = 0.8,
    private readonly maxTokens = 128000
  ) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "pre_reasoning" && context.messages) {
      const estimatedTokens = this.estimateTokens(context.messages);
      const ratio = estimatedTokens / this.maxTokens;

      if (ratio > this.compressionThreshold) {
        const beforeCount = context.messages.length;
        context.messages = this.compressMessages(context.messages);
        const afterCount = context.messages.length;
        console.log(
          `[ContextManagementHook] 触发压缩: ${estimatedTokens} tokens (${(ratio * 100).toFixed(1)}%) — ` +
          `${beforeCount} → ${afterCount} 条消息`
        );
      }
    }
    return context;
  }

  private estimateTokens(messages: import("../../port/message/ChatMessage.js").ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      const text = msg.content.map((c) => (c.type === "text" ? c.text.length : 0)).reduce((a, b) => a + b, 0);
      return sum + Math.ceil(text / 4);
    }, 0);
  }

  private compressMessages(messages: import("../../port/message/ChatMessage.js").ChatMessage[]): import("../../port/message/ChatMessage.js").ChatMessage[] {
    if (messages.length <= 4) return messages;

    // Strategy: keep system messages, the first user message, the most recent assistant message,
    // and the last 3 messages. Compress the middle by dropping oldest non-system messages.
    const systemMsgs = messages.filter((m) => m.role === "system");
    const firstUser = messages.find((m) => m.role === "user");
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const tail = messages.slice(-3);

    const core = new Set([firstUser, lastAssistant, ...tail].filter(Boolean));
    const result: import("../../port/message/ChatMessage.js").ChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system" || core.has(msg)) {
        result.push(msg);
      }
    }

    // If still too large, add a truncation notice
    if (result.length < messages.length) {
      result.splice(result.length - 1, 0, ChatMessage.text(
        "user",
        "ContextManagementHook",
        `【上下文压缩】已截断 ${messages.length - result.length} 条较早的历史消息以节省 token。`
      ));
    }

    return result;
  }
}
