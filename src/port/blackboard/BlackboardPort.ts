import type { BlackboardEntry } from "./BlackboardEntry.js";

/**
 * 黑板（Blackboard）端口。
 *
 * 一块会话级、带 TTL 的共享存储，多 Agent 协作时用于记录已搜索到的关键知识要点、
 * 联网搜索的返回内容等，从而避免重复的工具调用与联网 API 调用开销。
 *
 * 纯接口，零框架依赖；实现位于 `core/blackboard/`。
 */
export interface BlackboardPort {
  /**
   * 写入一条记录，覆盖相同 key 的旧记录。
   * @param ttlSeconds 存活秒数，从写入时刻起算。
   */
  write(key: string, value: string, source: string, agentType: string, ttlSeconds: number): void;

  /** 读取一条记录；命中但已过期则返回 undefined（并惰性清除）。 */
  read(key: string): BlackboardEntry | undefined;

  /** 关键字搜索：对 key 与 value 做大小写不敏感包含匹配（跳过过期项）。 */
  search(keyword: string): BlackboardEntry[];

  /** 返回最近写入的 n 条未过期记录，按 createdAt 倒序。 */
  listRecent(n: number): BlackboardEntry[];

  /** 主动清除所有已过期记录。 */
  evictExpired(): void;

  /** 当前未过期记录数（用于观测 / 测试）。 */
  size(): number;
}

/**
 * 黑板仓库端口：按 sessionId 管理多块黑板。
 *
 * 黑板按会话隔离——同一次 design 运行内的所有子 Agent 共享一块黑板，
 * 跨会话不共享（避免陈旧数据污染）。
 */
export interface BlackboardStorePort {
  /** 获取指定会话的黑板，不存在则惰性创建。 */
  getOrCreate(sessionId: string): BlackboardPort;

  /** 移除指定会话的黑板（会话清理时调用）。 */
  remove(sessionId: string): void;

  /** 清除所有会话中已过期的记录（由定时器周期调用）。 */
  evictAll(): void;
}
