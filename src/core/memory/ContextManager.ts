import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";

export class ContextManager {
  private readonly maxTokens: number;
  private readonly compressionThreshold: number;

  constructor(maxTokens = 128000, compressionThreshold = 0.7) {
    this.maxTokens = maxTokens;
    this.compressionThreshold = compressionThreshold;
  }

  shouldCompress(messages: ChatMessage[]): boolean {
    return this.estimateTokens(messages) / this.maxTokens > this.compressionThreshold;
  }

  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (!this.shouldCompress(messages)) return messages;

    const systemMessages = messages.filter((m) => m.role === "system");
    const recentMessages = messages.slice(-10);
    const summary: ChatMessage = {
      role: "system",
      content: [
        {
          type: "text",
          text: `[上下文摘要] 前面 ${messages.length - recentMessages.length - systemMessages.length} 条消息已压缩`,
        },
      ],
      metadata: { compressed: true },
    };

    return [...systemMessages, summary, ...recentMessages];
  }

  estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      const text = CM.textContent(msg);
      return sum + Math.ceil(text.length / 4) + 50;
    }, 0);
  }
}
