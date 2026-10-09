export interface SessionMeta {
  id: string;
  requirement: string;
  mode: "design" | "query" | "table";
  role: string;
  status:
    | "queued"
    | "running"
    | "waiting_hitl"
    | "completed"
    | "failed"
    | "cancelled"
    | "timed_out"
    | "clarifying";
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
  hitlCheckpointId?: string;
  /** Pinned artifact version snapshot (MVCC). */
  versionSnapshotId?: string;
  /** 人工触发"压缩上下文"生成的会话摘要；后续执行自动注入 prompt 背景 */
  contextSummary?: string;
  /** 最近一次 LLM 调用模型实际收到的 input tokens（会话上下文长度） */
  contextTokens?: number;
  /** 记录该值时生效模型的上下文窗口 */
  contextWindow?: number;
}

export interface SessionRepository {
  create(meta: SessionMeta): Promise<void>;
  update(id: string, patch: Partial<SessionMeta>): Promise<void>;
  get(id: string): Promise<SessionMeta | null>;
  list(limit?: number, offset?: number): Promise<SessionMeta[]>;
  delete(id: string): Promise<boolean>;
}
