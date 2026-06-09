import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { StoreMemoryParams, MemorySemanticType } from "../../port/memory/LongTermMemoryPort.js";

/**
 * Extracts structured memory entries from agent conversation messages.
 *
 * This is a framework-agnostic, rule-based extractor that identifies
 * key facts, decisions, preferences, and procedural knowledge from
 * conversation text. It does NOT depend on any LLM — that would
 * require injecting a ChatModelPort, which is done at the composition
 * root level (MemoryManager) instead.
 */
export class MemoryExtractor {
  /** Patterns that indicate a factual/semantic memory worth storing. */
  private static readonly SEMANTIC_PATTERNS = [
    /(?:项目|系统|框架|技术栈|架构)[使用的用的是]+(.+)/g,
    /(?:基于|采用|选用|使用)(.+?)(?:作为|来|进行|实现)/g,
    /(?:要求|需要|必须|应该)(.+)/g,
    /(?:定义|规定|约定)(.+)/g,
  ];

  /** Patterns that indicate an episodic memory (a decision or event). */
  private static readonly EPISODIC_PATTERNS = [
    /(?:决定|确定|选择了|最终采用)(.+)/g,
    /(?:修改|调整|变更|更新)(.+?)(?:为|改成|调整为)(.+)/g,
    /(?:讨论后|经过分析|综合考虑)(.+)/g,
  ];

  /** Patterns that indicate a procedural memory (a process or workflow). */
  private static readonly PROCEDURAL_PATTERNS = [
    /(?:流程|步骤|顺序)[是为：:]+(.+)/g,
    /(?:先[做写执行].+?)[，,]?(?:然后|接着|再)(.+)/g,
    /(?:第一步|第二步|第三步|1[\.、]|2[\.、])(.+)/g,
  ];

  /** Patterns that indicate a user profile / preference. */
  private static readonly PROFILE_PATTERNS = [
    /(?:偏好|喜欢|习惯|风格)[是为：:]+(.+)/g,
    /(?:我[想要希望喜欢])(.+)/g,
    /(?:不要|避免|禁止|不喜欢)(.+)/g,
  ];

  /**
   * Extract memory candidates from a list of chat messages.
   * Returns store params ready to be persisted via LongTermMemoryPort.
   */
  extract(
    messages: ChatMessage[],
    namespace: string,
  ): StoreMemoryParams[] {
    const results: StoreMemoryParams[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      const text = ChatMessage.textContent(msg);
      if (!text || text.length < 10) continue;

      // Extract from user messages only (agent outputs are derived)
      if (msg.role !== "user" && msg.role !== "assistant") continue;

      this.extractByPatterns(text, namespace, "semantic", MemoryExtractor.SEMANTIC_PATTERNS, results, seen);
      this.extractByPatterns(text, namespace, "episodic", MemoryExtractor.EPISODIC_PATTERNS, results, seen);
      this.extractByPatterns(text, namespace, "procedural", MemoryExtractor.PROCEDURAL_PATTERNS, results, seen);

      // Profile patterns only from user messages
      if (msg.role === "user") {
        this.extractByPatterns(text, namespace, "profile", MemoryExtractor.PROFILE_PATTERNS, results, seen);
      }
    }

    return results;
  }

  /**
   * Extract a summary-level episodic memory from a completed task.
   * This is a higher-level extraction for task results.
   */
  extractFromTaskResult(
    taskId: string,
    domain: string,
    output: string,
    namespace: string,
  ): StoreMemoryParams | null {
    if (!output || output.length < 20) return null;

    // Truncate very long outputs for storage
    const content = output.length > 500
      ? output.substring(0, 500) + "..."
      : output;

    return {
      semanticType: "episodic",
      namespace,
      key: `task_result_${taskId}`,
      content: `[${domain}] ${content}`,
      importance: 0.6,
      tags: [domain, "task_result"],
    };
  }

  private extractByPatterns(
    text: string,
    namespace: string,
    semanticType: MemorySemanticType,
    patterns: RegExp[],
    results: StoreMemoryParams[],
    seen: Set<string>,
  ): void {
    for (const pattern of patterns) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const content = match[0].trim();
        if (content.length < 5 || content.length > 300) continue;

        // Deduplicate by content hash
        const dedupeKey = `${semanticType}:${content}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        results.push({
          semanticType,
          namespace,
          key: `${semanticType}_${Date.now()}_${results.length}`,
          content,
          importance: this.inferImportance(semanticType, content),
          tags: [semanticType],
        });
      }
    }
  }

  /** Infer importance based on semantic type and content signals. */
  private inferImportance(semanticType: MemorySemanticType, content: string): number {
    // Profile and procedural memories are generally more important
    const baseImportance: Record<MemorySemanticType, number> = {
      profile: 0.8,
      procedural: 0.7,
      episodic: 0.5,
      semantic: 0.6,
    };

    let importance = baseImportance[semanticType] ?? 0.5;

    // Boost if content contains strong signals
    if (/必须|关键|重要|核心/.test(content)) importance = Math.min(1, importance + 0.15);
    if (/不要|禁止|避免/.test(content)) importance = Math.min(1, importance + 0.1);

    return Math.round(importance * 100) / 100;
  }
}
