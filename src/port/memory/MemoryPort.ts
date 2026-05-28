import type { ChatMessage } from "../message/ChatMessage.js";

export interface MemoryPort {
  addMessage(message: ChatMessage): void;
  getMessages(): ChatMessage[];
  clear(): void;
  size(): number;
  maybeCompress(messages: ChatMessage[]): Promise<ChatMessage[]>;
}
