/**
 * 黑板上的一条记录。代表一段已被某个 Agent / 工具调用得到、
 * 可在同一会话内被其他 Agent 复用的知识要点或工具返回内容。
 */
export interface BlackboardEntry {
  /** 缓存 / 事实键（精确匹配去重）。 */
  readonly key: string;
  /** 完整字符串内容（工具输出或 Agent 记录的要点）。 */
  readonly value: string;
  /** 写入者标签，如工具名 "tavily_search" 或子 Agent 名。 */
  readonly source: string;
  /** 写入时所属的任务 / Agent 类型，用于注入上下文时的归类展示。 */
  readonly agentType: string;
  /** 创建时间（epoch ms）。 */
  readonly createdAt: number;
  /** 过期时间（epoch ms），读取时校验。 */
  readonly expiresAt: number;
}
