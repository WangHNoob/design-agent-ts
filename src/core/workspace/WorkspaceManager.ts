import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export class WorkspaceManager {
  constructor(
    private baseDir: string = "workspace",
    private fs: FileSystemPort
  ) {}

  async initialize(sessionId: string): Promise<void> {
    const dir = this.fs.join(this.baseDir, sessionId);
    await this.fs.mkdir(dir, { recursive: true });
  }

  async writeTaskOutput(sessionId: string, taskId: string, fileName: string, content: string): Promise<void> {
    const dir = this.fs.join(this.baseDir, sessionId, this.sanitize(taskId));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(dir, this.sanitize(fileName)), content);
  }

  async readTaskOutput(sessionId: string, taskId: string, fileName: string): Promise<string | null> {
    const filePath = this.fs.join(this.baseDir, sessionId, this.sanitize(taskId), this.sanitize(fileName));
    return this.fs.readFile(filePath);
  }

  async listTaskFiles(sessionId: string, taskId: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId, this.sanitize(taskId));
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async listTasks(sessionId: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId);
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isDirectory).map((e) => e.name);
    } catch {
      return [];
    }
  }

  // Legacy flat methods (kept for backward compat)
  async writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
    const safePath = filePath.split(/[\\/]/).map((s) => this.sanitize(s)).join("/");
    const dir = this.fs.join(this.baseDir, sessionId, this.fs.dirname(safePath));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(this.baseDir, sessionId, safePath), content);
  }

  async readFile(sessionId: string, filePath: string): Promise<string | null> {
    const safePath = filePath.split(/[\\/]/).map((s) => this.sanitize(s)).join("/");
    return this.fs.readFile(this.fs.join(this.baseDir, sessionId, safePath));
  }

  async listFiles(sessionId: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId);
    const entries = await this.fs.readdir(dir);
    return entries.filter((e) => e.isFile).map((e) => e.name);
  }

  private sanitize(segment: string): string {
    // Remove path traversal sequences and filesystem-special characters
    return segment
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^\.+/, "_")
      .trim() || "_";
  }
}
