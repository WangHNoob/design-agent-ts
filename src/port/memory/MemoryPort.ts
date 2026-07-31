import type { ChatMessage } from "../message/ChatMessage.js";

/** One archived batch produced when messages are evicted from the active window. */
export interface ArchiveEntry {
  readonly id: string;
  readonly summarizedAt: string;
  readonly messageCount: number;
  readonly summary: string;
  readonly messageRoles: readonly string[];
}

export interface MemoryPort {
  addMessage(message: ChatMessage): void;
  getMessages(): ChatMessage[];
  clear(): void;
  size(): number;
  maybeCompress(messages: ChatMessage[]): Promise<ChatMessage[]>;
  /** Present on sliding-window implementations; empty/undefined elsewhere. */
  listArchive?(): readonly ArchiveEntry[];
}
