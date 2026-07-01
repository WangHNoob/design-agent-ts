import type { BlackboardPort, BlackboardStorePort } from "../../port/blackboard/BlackboardPort.js";
import { InMemoryBlackboard } from "./InMemoryBlackboard.js";

/**
 * 按 sessionId 管理多块 {@link InMemoryBlackboard} 的内存仓库。
 *
 * 黑板按会话隔离并惰性创建；过期记录由 server 层定时器调用 {@link evictAll} 周期清理
 * （core 不持有定时器，仅提供纯函数），避免内存泄漏。
 */
export class BlackboardStore implements BlackboardStorePort {
  private readonly blackboards = new Map<string, InMemoryBlackboard>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  getOrCreate(sessionId: string): BlackboardPort {
    let bb = this.blackboards.get(sessionId);
    if (!bb) {
      bb = new InMemoryBlackboard(this.now);
      this.blackboards.set(sessionId, bb);
    }
    return bb;
  }

  remove(sessionId: string): void {
    this.blackboards.delete(sessionId);
  }

  evictAll(): void {
    for (const bb of this.blackboards.values()) {
      bb.evictExpired();
    }
  }
}
