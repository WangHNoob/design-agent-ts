import type { LongTermMemoryPort, MemoryEntry, MemorySearchResult, StoreMemoryParams, RetrieveMemoryParams } from "../../port/memory/LongTermMemoryPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { MemoryExtractor } from "./MemoryExtractor.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";

/** Configuration for the MemoryManager. */
export interface MemoryManagerConfig {
  /** Default namespace for memory operations (e.g. "global" or a userId). */
  readonly defaultNamespace: string;
  /** Maximum number of memories to retrieve when injecting context. */
  readonly maxContextMemories: number;
  /** Minimum importance score for a memory to be included in context injection. */
  readonly minImportanceForContext: number;
  /** Whether to automatically extract memories after agent calls. */
  readonly autoExtract: boolean;
  /** Whether to automatically prune memories on forget(). */
  readonly autoPrune: boolean;
  /** Maximum age in milliseconds before a low-importance memory is pruned. Default: 30 days. */
  readonly maxAgeMs: number;
  /** Importance threshold below which memories are candidates for pruning. Default: 0.3. */
  readonly pruneBelowImportance: number;
}

const DEFAULT_CONFIG: MemoryManagerConfig = {
  defaultNamespace: "global",
  maxContextMemories: 10,
  minImportanceForContext: 0.4,
  autoExtract: true,
  autoPrune: true,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  pruneBelowImportance: 0.3,
};

/**
 * Framework-agnostic long-term memory manager.
 *
 * Orchestrates the Record & Retrieve cycle described in the article:
 * - **Record**: Extracts key information from conversations via MemoryExtractor,
 *   then persists them through LongTermMemoryPort.
 * - **Retrieve**: Searches relevant memories and formats them for injection
 *   into the agent's short-term context (system prompt or user message).
 * - **Forget**: Prunes low-importance or stale memories to prevent noise.
 *
 * This class lives in core/ and depends ONLY on port/ interfaces.
 */
export class MemoryManager {
  private readonly extractor: MemoryExtractor;
  private readonly config: MemoryManagerConfig;

  private readonly logger: LoggerPort;

  constructor(
    private readonly memoryPort: LongTermMemoryPort,
    config?: Partial<MemoryManagerConfig>,
    logger?: LoggerPort,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extractor = new MemoryExtractor();
    this.logger = logger ?? new ConsoleLogger();
  }

  // ─── Record (Write) ─────────────────────────────────────────────

  /**
   * Extract and store memories from a conversation.
   * This implements the "Write" side of the Record & Retrieve cycle.
   */
  async recordFromConversation(
    messages: ChatMessage[],
    namespace?: string,
  ): Promise<MemoryEntry[]> {
    const ns = namespace ?? this.config.defaultNamespace;
    const candidates = this.extractor.extract(messages, ns);
    if (candidates.length === 0) return [];

    const stored: MemoryEntry[] = [];
    for (const params of candidates) {
      try {
        const entry = await this.memoryPort.store(params);
        stored.push(entry);
      } catch (err) {
        this.logger.error(`[MemoryManager] Failed to store memory:`, { err });
      }
    }
    return stored;
  }

  /**
   * Record a task result as an episodic memory.
   */
  async recordTaskResult(
    taskId: string,
    domain: string,
    output: string,
    namespace?: string,
  ): Promise<MemoryEntry | null> {
    const ns = namespace ?? this.config.defaultNamespace;
    const params = this.extractor.extractFromTaskResult(taskId, domain, output, ns);
    if (!params) return null;

    try {
      return await this.memoryPort.store(params);
    } catch (err) {
      this.logger.error(`[MemoryManager] Failed to store task result memory:`, { err });
      return null;
    }
  }

  /**
   * Store a single memory entry directly.
   */
  async store(params: StoreMemoryParams): Promise<MemoryEntry> {
    return this.memoryPort.store(params);
  }

  // ─── Retrieve (Read) ────────────────────────────────────────────

  /**
   * Retrieve relevant memories for a given query and format them
   * for injection into the agent's context.
   */
  async retrieveForContext(
    query: string,
    namespace?: string,
    limit?: number,
  ): Promise<string> {
    const ns = namespace ?? this.config.defaultNamespace;
    const maxResults = limit ?? this.config.maxContextMemories;

    const results = await this.memoryPort.search({
      namespace: ns,
      query,
      limit: maxResults,
      minImportance: this.config.minImportanceForContext,
    });

    if (results.length === 0) return "";

    return this.formatMemoriesForContext(results);
  }

  /**
   * Retrieve raw memory search results for a given query.
   */
  async search(params: RetrieveMemoryParams): Promise<MemorySearchResult[]> {
    return this.memoryPort.search(params);
  }

  /**
   * Get a specific memory by namespace + key.
   */
  async get(namespace: string, key: string): Promise<MemoryEntry | null> {
    return this.memoryPort.get(namespace, key);
  }

  /**
   * List all memories in a namespace.
   */
  async list(namespace: string, semanticType?: import("../../port/memory/LongTermMemoryPort.js").MemorySemanticType): Promise<MemoryEntry[]> {
    return this.memoryPort.list(namespace, semanticType);
  }

  // ─── Forget (Prune) ─────────────────────────────────────────────

  /**
   * Prune stale or low-importance memories.
   * Implements the forgetting mechanism from the article:
   * - Time decay: remove memories older than maxAgeMs
   * - Importance filtering: remove memories below pruneBelowImportance
   */
  async forget(namespace?: string): Promise<import("../../port/memory/LongTermMemoryPort.js").ForgetResult> {
    const ns = namespace ?? this.config.defaultNamespace;
    return this.memoryPort.forget({
      namespace: ns,
      maxAgeMs: this.config.maxAgeMs,
      minImportance: this.config.pruneBelowImportance,
    });
  }

  /**
   * Delete specific memories by ID.
   */
  async forgetByIds(ids: string[], namespace?: string): Promise<import("../../port/memory/LongTermMemoryPort.js").ForgetResult> {
    const ns = namespace ?? this.config.defaultNamespace;
    return this.memoryPort.forget({
      namespace: ns,
      ids,
    });
  }

  // ─── Context Injection ──────────────────────────────────────────

  /**
   * Build a system-prompt section from relevant memories for a given query.
   * This is the bridge between long-term memory and short-term context.
   */
  async buildContextSection(
    query: string,
    namespace?: string,
  ): Promise<string> {
    const memoryContext = await this.retrieveForContext(query, namespace);
    if (!memoryContext) return "";

    return `## 长期记忆（相关历史信息）\n\n${memoryContext}\n\n> 以上信息来自跨会话的长期记忆，请在回答时参考这些信息。`;
  }

  // ─── Health ──────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    return this.memoryPort.healthCheck();
  }

  // ─── Private ────────────────────────────────────────────────────

  private formatMemoriesForContext(results: MemorySearchResult[]): string {
    const grouped = new Map<string, MemorySearchResult[]>();
    for (const r of results) {
      const type = r.entry.semanticType;
      if (!grouped.has(type)) grouped.set(type, []);
      grouped.get(type)!.push(r);
    }

    const sections: string[] = [];
    const typeLabels: Record<string, string> = {
      semantic: "事实知识",
      episodic: "历史经历",
      procedural: "操作流程",
      profile: "用户偏好",
    };

    for (const [type, entries] of grouped) {
      const label = typeLabels[type] ?? type;
      const items = entries
        .sort((a, b) => b.score - a.score)
        .map((r) => `- ${r.entry.content}`)
        .join("\n");
      sections.push(`### ${label}\n${items}`);
    }

    return sections.join("\n\n");
  }
}
