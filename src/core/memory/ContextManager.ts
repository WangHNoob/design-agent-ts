import type { ArchiveEntry } from "../../port/memory/MemoryPort.js";
import type { SummarizerPort } from "../../port/memory/SummarizerPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";
import { HeuristicSummarizer } from "./HeuristicSummarizer.js";

export interface ContextManagerOptions {
  /** Soft token ceiling used with compressionThreshold. Default 128000. */
  maxTokens?: number;
  /** Fraction of maxTokens that triggers token-based compression. Default 0.7. */
  compressionThreshold?: number;
  /** Keep the most recent N non-system messages verbatim (message count, not turns). */
  protectRecentTurns?: number;
  /**
   * Evict when non-system (non-archive-summary) messages exceed this count,
   * regardless of token budget. Default: protectRecentTurns * 2.
   */
  maxActiveMessages?: number;
  /** Always summarize on eviction (acceptance requirement). Default true. */
  summarizeOnEvict?: boolean;
  /** Optional summarizer; defaults to HeuristicSummarizer. */
  summarizer?: SummarizerPort;
}

export interface CompressResult {
  readonly messages: ChatMessage[];
  readonly archiveEntry: ArchiveEntry | null;
  readonly evicted: boolean;
}

/**
 * Sliding-window context compressor.
 * Evicts oldest messages when over maxActiveMessages OR over token budget,
 * always summarizing evicted content into an archive entry (+ summary message).
 */
export class ContextManager {
  private readonly maxTokens: number;
  private readonly compressionThreshold: number;
  private readonly protectRecentTurns: number;
  private readonly maxActiveMessages: number;
  private readonly summarizeOnEvict: boolean;
  private readonly summarizer: SummarizerPort;
  private archiveSeq = 0;

  constructor(options: ContextManagerOptions = {}) {
    this.maxTokens = options.maxTokens ?? 128_000;
    this.compressionThreshold = options.compressionThreshold ?? 0.7;
    this.protectRecentTurns = Math.max(1, options.protectRecentTurns ?? 10);
    this.maxActiveMessages = Math.max(
      this.protectRecentTurns,
      options.maxActiveMessages ?? this.protectRecentTurns * 2,
    );
    this.summarizeOnEvict = options.summarizeOnEvict !== false;
    this.summarizer = options.summarizer ?? new HeuristicSummarizer();
  }

  shouldCompress(messages: ChatMessage[]): boolean {
    if (this.maxTokens <= 0) return false;
    return this.estimateTokens(messages) / this.maxTokens > this.compressionThreshold;
  }

  /** True when message-count window is exceeded (independent of token budget). */
  shouldEvictByCount(messages: ChatMessage[]): boolean {
    return this.activeNonSystemCount(messages) > this.maxActiveMessages;
  }

  needsEviction(messages: ChatMessage[]): boolean {
    return this.shouldEvictByCount(messages) || this.shouldCompress(messages);
  }

  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const result = await this.compressWithArchive(messages);
    return result.messages;
  }

  async compressWithArchive(messages: ChatMessage[]): Promise<CompressResult> {
    if (!this.needsEviction(messages)) {
      return { messages, archiveEntry: null, evicted: false };
    }

    const systemMessages = messages.filter(
      (m) => m.role === "system" && !m.metadata?.archiveSummary,
    );
    const priorSummaries = messages.filter(
      (m) => m.role === "system" && m.metadata?.archiveSummary === true,
    );
    const active = messages.filter((m) => m.role !== "system");

    if (active.length <= this.protectRecentTurns) {
      // Over token budget but nothing safe to evict beyond the protected window.
      return { messages, archiveEntry: null, evicted: false };
    }

    const recent = active.slice(-this.protectRecentTurns);
    const toEvict = active.slice(0, -this.protectRecentTurns);
    if (toEvict.length === 0) {
      return { messages, archiveEntry: null, evicted: false };
    }

    let archiveEntry: ArchiveEntry | null = null;
    const summaryMessages: ChatMessage[] = [...priorSummaries];

    if (this.summarizeOnEvict) {
      const summaryText = await Promise.resolve(this.summarizer.summarize(toEvict));
      this.archiveSeq += 1;
      archiveEntry = {
        id: `archive-${this.archiveSeq}`,
        summarizedAt: new Date().toISOString(),
        messageCount: toEvict.length,
        summary: summaryText,
        messageRoles: toEvict.map((m) => m.role),
      };
      summaryMessages.push({
        role: "system",
        content: [
          {
            type: "text",
            text: `[上下文归档 #${archiveEntry.id}] 已摘要 ${archiveEntry.messageCount} 条较早消息：\n${summaryText}`,
          },
        ],
        metadata: { compressed: true, archiveSummary: true, archiveId: archiveEntry.id },
      });
    }

    return {
      messages: [...systemMessages, ...summaryMessages, ...recent],
      archiveEntry,
      evicted: true,
    };
  }

  estimateTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      const text = CM.textContent(msg);
      return sum + Math.ceil(text.length / 4) + 50;
    }, 0);
  }

  private activeNonSystemCount(messages: ChatMessage[]): number {
    return messages.filter((m) => m.role !== "system").length;
  }
}
