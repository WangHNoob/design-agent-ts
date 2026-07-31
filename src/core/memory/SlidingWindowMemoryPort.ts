import type { ArchiveEntry, MemoryPort } from "../../port/memory/MemoryPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ContextManager, type ContextManagerOptions } from "./ContextManager.js";

export interface SlidingWindowMemoryOptions extends ContextManagerOptions {
  /** When false, behaves like a plain buffer (no eviction). Default true. */
  archiveEnabled?: boolean;
}

/**
 * Short-term MemoryPort with sliding-window eviction + queryable archive.
 * Eviction runs on addMessage and maybeCompress, even when under token budget
 * (message-count overflow). Heuristic summarization is applied synchronously
 * so addMessage completes with a stable window.
 */
export class SlidingWindowMemoryPort implements MemoryPort {
  private messages: ChatMessage[] = [];
  private readonly archive: ArchiveEntry[] = [];
  private readonly contextManager: ContextManager;
  private readonly archiveEnabled: boolean;
  private pendingEvict: Promise<void> | null = null;

  constructor(options: SlidingWindowMemoryOptions = {}) {
    this.archiveEnabled = options.archiveEnabled !== false;
    this.contextManager = new ContextManager(options);
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    if (!this.archiveEnabled || !this.contextManager.needsEviction(this.messages)) {
      return;
    }
    // Kick eviction; sync heuristic summarizers settle on the same tick via
    // microtask — callers that need a hard barrier should await maybeCompress.
    this.pendingEvict = (this.pendingEvict ?? Promise.resolve())
      .then(() => this.runEvict())
      .catch(() => undefined);
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
    this.archive.length = 0;
    this.pendingEvict = null;
  }

  size(): number {
    return this.messages.length;
  }

  listArchive(): readonly ArchiveEntry[] {
    return [...this.archive];
  }

  async maybeCompress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    if (this.pendingEvict) {
      await this.pendingEvict;
      this.pendingEvict = null;
    }
    if (!this.archiveEnabled) return [...messages];
    const result = await this.contextManager.compressWithArchive(messages);
    if (result.archiveEntry) {
      this.archive.push(result.archiveEntry);
    }
    this.messages = result.messages;
    return result.messages;
  }

  private async runEvict(): Promise<void> {
    if (!this.contextManager.needsEviction(this.messages)) return;
    const result = await this.contextManager.compressWithArchive(this.messages);
    if (result.archiveEntry) {
      this.archive.push(result.archiveEntry);
    }
    this.messages = result.messages;
  }
}
