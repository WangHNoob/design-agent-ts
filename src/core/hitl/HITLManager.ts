import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export interface HITLCheckpoint {
  id: string;
  sessionId: string;
  stage: "plan" | "subagent" | "integrate";
  status: "waiting_review" | "approved" | "rejected" | "modified";
  content: string;
  contentType: "markdown" | "json";
  agentName?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewAction?: "approve" | "reject" | "modify";
  reviewComment?: string;
  modifiedContent?: string;
}

export class HITLManager {
  private checkpointDir: string;
  private checkpoints: Map<string, HITLCheckpoint> = new Map();
  private initialized = false;

  constructor(
    private fs: FileSystemPort,
    baseDir = "sessions"
  ) {
    this.checkpointDir = this.fs.join(baseDir, "hitl-checkpoint");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.fs.mkdir(this.checkpointDir, { recursive: true });

    try {
      const entries = await this.fs.readdir(this.checkpointDir);
      for (const entry of entries.filter((e) => e.isFile && e.name.endsWith(".json"))) {
        const data = await this.fs.readFile(this.fs.join(this.checkpointDir, entry.name));
        if (data) {
          const list = JSON.parse(data) as HITLCheckpoint[];
          for (const cp of list) {
            this.checkpoints.set(cp.id, cp);
          }
        }
      }
    } catch {
      // ignore
    }
    this.initialized = true;
  }

  async createCheckpoint(
    sessionId: string,
    stage: HITLCheckpoint["stage"],
    content: string,
    options?: { contentType?: HITLCheckpoint["contentType"]; agentName?: string }
  ): Promise<HITLCheckpoint> {
    await this.initialize();
    const id = `${sessionId}-${stage}-${Date.now()}`;
    const checkpoint: HITLCheckpoint = {
      id,
      sessionId,
      stage,
      status: "waiting_review",
      content,
      contentType: options?.contentType ?? "markdown",
      agentName: options?.agentName,
      createdAt: new Date().toISOString(),
    };
    this.checkpoints.set(id, checkpoint);
    await this.persistSession(sessionId);
    return checkpoint;
  }

  async reviewCheckpoint(
    id: string,
    action: "approve" | "reject" | "modify",
    options?: { comment?: string; modifiedContent?: string }
  ): Promise<HITLCheckpoint | null> {
    await this.initialize();
    const cp = this.checkpoints.get(id);
    if (!cp) return null;
    if (cp.status !== "waiting_review") return null;

    const updated: HITLCheckpoint = {
      ...cp,
      status: action === "modify" ? "modified" : (action as HITLCheckpoint["status"]),
      reviewAction: action,
      reviewComment: options?.comment,
      modifiedContent: options?.modifiedContent,
      reviewedAt: new Date().toISOString(),
    };
    this.checkpoints.set(id, updated);
    await this.persistSession(cp.sessionId);
    return updated;
  }

  async getCheckpoint(id: string): Promise<HITLCheckpoint | null> {
    await this.initialize();
    return this.checkpoints.get(id) ?? null;
  }

  async listBySession(sessionId: string): Promise<HITLCheckpoint[]> {
    await this.initialize();
    return Array.from(this.checkpoints.values())
      .filter((cp) => cp.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listWaiting(): Promise<HITLCheckpoint[]> {
    await this.initialize();
    return Array.from(this.checkpoints.values())
      .filter((cp) => cp.status === "waiting_review")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  private async persistSession(sessionId: string): Promise<void> {
    const filePath = this.fs.join(this.checkpointDir, `${sessionId}.json`);
    const sessionCheckpoints = Array.from(this.checkpoints.values()).filter(
      (c) => c.sessionId === sessionId
    );
    await this.fs.writeFile(filePath, JSON.stringify(sessionCheckpoints, null, 2));
  }
}
