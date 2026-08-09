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

    // 轮次切分：非 tool 消息开启新轮次，其后连续的 tool 消息并入该轮次。
    // 归档/保留边界永不切开 assistant(tool_calls) ↔ tool 消息对 —— 否则
    // 消息序列会含"悬空 tool 消息"，被 OpenAI 系 provider 以 400 拒绝
    // (INVALID_TOOL_RESULTS，评测 EV-058 实证)。
    const turns = splitIntoTurns(active);
    if (turns.length <= this.protectRecentTurns) {
      return { messages, archiveEntry: null, evicted: false };
    }

    const recentTurns = turns.slice(-this.protectRecentTurns);
    const toEvict = turns.slice(0, -this.protectRecentTurns).flat();
    if (toEvict.length === 0) {
      return { messages, archiveEntry: null, evicted: false };
    }
    const recent = recentTurns.flat();

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

/**
 * Split non-system messages into turn units.
 *
 * A turn starts at every non-`tool` message (user / assistant) and absorbs all
 * following consecutive `tool` messages — so an assistant(tool_calls) message
 * and its ToolMessages always stay in the same unit. Dangling `tool` messages
 * (whose assistant turn was already evicted earlier) form their own unit.
 */
function splitIntoTurns(active: ChatMessage[]): ChatMessage[][] {
  const turns: ChatMessage[][] = [];
  for (const m of active) {
    if (m.role !== "tool" || turns.length === 0) {
      turns.push([m]);
    } else {
      turns[turns.length - 1]!.push(m);
    }
  }
  return turns;
}
