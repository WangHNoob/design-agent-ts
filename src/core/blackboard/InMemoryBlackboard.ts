import type { BlackboardPort } from "../../port/blackboard/BlackboardPort.js";
import type { BlackboardEntry } from "../../port/blackboard/BlackboardEntry.js";

/**
 * 黑板的纯内存实现，带 TTL。框架无关，仅依赖 `port/`。
 *
 * 与 {@link import("../memory/InMemoryMemoryPort.js").InMemoryMemoryPort} 定位一致：
 * core 层合法的内存实现，不触碰 fs / fetch 等基础设施。
 */
export class InMemoryBlackboard implements BlackboardPort {
  private readonly entries = new Map<string, BlackboardEntry>();

  /** 注入时钟以便单测；默认 Date.now。 */
  constructor(private readonly now: () => number = () => Date.now()) {}

  write(key: string, value: string, source: string, agentType: string, ttlSeconds: number): void {
    const createdAt = this.now();
    this.entries.set(key, {
      key,
      value,
      source,
      agentType,
      createdAt,
      expiresAt: createdAt + ttlSeconds * 1000,
    });
  }

  read(key: string): BlackboardEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  search(keyword: string): BlackboardEntry[] {
    const needle = keyword.toLowerCase();
    return this.activeEntries().filter(
      (e) => e.key.toLowerCase().includes(needle) || e.value.toLowerCase().includes(needle)
    );
  }

  listRecent(n: number): BlackboardEntry[] {
    return this.activeEntries()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(0, n));
  }

  evictExpired(): void {
    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry)) {
        this.entries.delete(key);
      }
    }
  }

  size(): number {
    return this.activeEntries().length;
  }

  private isExpired(entry: BlackboardEntry): boolean {
    return this.now() >= entry.expiresAt;
  }

  /** 返回所有未过期记录（不修改集合）。 */
  private activeEntries(): BlackboardEntry[] {
    const result: BlackboardEntry[] = [];
    for (const entry of this.entries.values()) {
      if (!this.isExpired(entry)) {
        result.push(entry);
      }
    }
    return result;
  }
}
