import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { ArchiveEntry, MemoryPort } from "../../port/memory/MemoryPort.js";
import { ContextManager } from "../memory/ContextManager.js";

export interface ContextManagementHookOptions {
  compressionThreshold?: number;
  maxTokens?: number;
  protectRecentTurns?: number;
  maxActiveMessages?: number;
  /** When set, eviction archives go through this MemoryPort (preferred production path). */
  memory?: MemoryPort;
}

/**
 * pre_reasoning hook: sliding-window eviction + archive.
 * Prefer an injected MemoryPort (SlidingWindow); otherwise ContextManager + local archives[].
 */
export class ContextManagementHook implements AgentHook {
  priority = 80;
  private readonly contextManager: ContextManager;
  private readonly options: ContextManagementHookOptions;
  private memory: MemoryPort | undefined;
  private readonly archives: ArchiveEntry[] = [];

  constructor(
    compressionThresholdOrOptions: number | ContextManagementHookOptions = 0.8,
    maxTokens = 128000,
  ) {
    const options: ContextManagementHookOptions =
      typeof compressionThresholdOrOptions === "number"
        ? { compressionThreshold: compressionThresholdOrOptions, maxTokens }
        : compressionThresholdOrOptions;
    this.options = { ...options };
    this.memory = options.memory;
    this.contextManager = new ContextManager({
      compressionThreshold: options.compressionThreshold ?? 0.8,
      maxTokens: options.maxTokens ?? 128000,
      protectRecentTurns: options.protectRecentTurns ?? 10,
      maxActiveMessages: options.maxActiveMessages ?? 40,
      summarizeOnEvict: true,
    });
  }

  /** Bind a per-agent MemoryPort without mutating the shared bootstrap instance. */
  withMemory(memory: MemoryPort): ContextManagementHook {
    return new ContextManagementHook({ ...this.options, memory });
  }

  listArchive(): readonly ArchiveEntry[] {
    if (this.memory?.listArchive) {
      return this.memory.listArchive();
    }
    return [...this.archives];
  }

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "pre_reasoning" && context.messages) {
      const beforeCount = context.messages.length;
      if (this.memory) {
        const compressed = await this.memory.maybeCompress(context.messages);
        if (compressed.length !== beforeCount) {
          console.log(
            `[ContextManagementHook] memory.maybeCompress: ${beforeCount} → ${compressed.length} 条消息` +
            ` (归档 ${this.listArchive().length})`,
          );
        }
        context.messages = compressed;
        return context;
      }

      if (this.contextManager.needsEviction(context.messages)) {
        const estimatedTokens = this.contextManager.estimateTokens(context.messages);
        const result = await this.contextManager.compressWithArchive(context.messages);
        if (result.archiveEntry) {
          this.archives.push(result.archiveEntry);
        }
        context.messages = result.messages;
        console.log(
          `[ContextManagementHook] 触发压缩/驱逐: ${estimatedTokens} tokens — ` +
          `${beforeCount} → ${result.messages.length} 条消息` +
          (result.archiveEntry ? ` (归档 ${result.archiveEntry.id})` : ""),
        );
      }
    }
    return context;
  }
}
