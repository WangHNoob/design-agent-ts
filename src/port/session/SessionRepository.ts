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
}

export interface SessionRepository {
  create(meta: SessionMeta): Promise<void>;
  update(id: string, patch: Partial<SessionMeta>): Promise<void>;
  get(id: string): Promise<SessionMeta | null>;
  list(limit?: number, offset?: number): Promise<SessionMeta[]>;
  delete(id: string): Promise<boolean>;
}
