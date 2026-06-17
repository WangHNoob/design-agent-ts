import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export interface SessionMeta {
  id: string;
  requirement: string;
  mode: "design" | "query" | "table";
  role: string;
  status: "running" | "waiting_hitl" | "completed" | "failed" | "clarifying";
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
  hitlCheckpointId?: string;
}

export class SessionManager {
  private sessionsDir: string;
  private sessionsFile: string;
  private sessions: Map<string, SessionMeta> = new Map();
  private initialized = false;
  private userId: string | null = null;
  private baseDirName: string;

  constructor(
    private fs: FileSystemPort,
    baseDir = "sessions",
    private defaultListLimit = 100
  ) {
    this.baseDirName = baseDir;
    this.sessionsDir = baseDir;
    this.sessionsFile = this.fs.join(baseDir, "sessions.jsonl");
  }

  /** Set the active user scope. When set, all storage paths are prefixed with `data/users/<userId>/`. Call with null to clear. */
  setUserId(userId: string | null): void {
    this.userId = userId;
    const base = userId ? `data/users/${userId}/${this.baseDirName}` : this.baseDirName;
    this.sessionsDir = base;
    this.sessionsFile = this.fs.join(base, "sessions.jsonl");
    // Reset initialized flag so the new user directory gets created on next access
    this.initialized = false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.fs.mkdir(this.sessionsDir, { recursive: true });
    await this.fs.mkdir(this.fs.join(this.sessionsDir, "hitl-checkpoint"), { recursive: true });

    try {
      const data = await this.fs.readFile(this.sessionsFile);
      if (data) {
        for (const line of data.split("\n").filter((l) => l.trim())) {
          const meta = JSON.parse(line) as SessionMeta;
          this.sessions.set(meta.id, meta);
        }
      }
    } catch {
      // file may not exist yet
    }
    this.initialized = true;
  }

  async create(meta: Omit<SessionMeta, "createdAt" | "updatedAt">): Promise<SessionMeta> {
    await this.initialize();
    const now = new Date().toISOString();
    const fullMeta: SessionMeta = { ...meta, createdAt: now, updatedAt: now };
    this.sessions.set(meta.id, fullMeta);
    await this.persist();
    return fullMeta;
  }

  async update(id: string, patch: Partial<SessionMeta>): Promise<SessionMeta | null> {
    await this.initialize();
    const existing = this.sessions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.sessions.set(id, updated);
    await this.persist();
    return updated;
  }

  async get(id: string): Promise<SessionMeta | null> {
    await this.initialize();
    return this.sessions.get(id) ?? null;
  }

  async list(limit = this.defaultListLimit, offset = 0): Promise<SessionMeta[]> {
    await this.initialize();
    const all = Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return all.slice(offset, offset + limit);
  }

  async delete(id: string): Promise<boolean> {
    await this.initialize();
    const existed = this.sessions.delete(id);
    if (existed) {
      await this.persist();
      try {
        const checkpointFile = this.fs.join(this.sessionsDir, "hitl-checkpoint", `${id}.json`);
        await this.fs.unlink(checkpointFile);
      } catch {
        // ignore
      }
    }
    return existed;
  }

  private async persist(): Promise<void> {
    const lines = Array.from(this.sessions.values())
      .map((s) => JSON.stringify(s))
      .join("\n");
    await this.fs.writeFile(this.sessionsFile, lines + "\n");
  }
}
