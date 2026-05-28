import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";

export class InMemoryMemoryPort implements MemoryPort {
  private messages: ChatMessage[] = [];

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  size(): number {
    return this.messages.length;
  }

  async maybeCompress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    return messages;
  }
}
