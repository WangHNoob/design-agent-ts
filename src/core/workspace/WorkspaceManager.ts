import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export class WorkspaceManager {
  private taskDirNames = new Map<string, string>();
  private userId: string | null = null;
  private baseDirName: string;

  constructor(
    private baseDir: string = "workspace",
    private fs: FileSystemPort
  ) {
    this.baseDirName = baseDir;
  }

  /** Set the active user scope. When set, all paths are prefixed with `data/users/<userId>/`. */
  setUserId(userId: string | null): void {
    this.userId = userId;
    this.baseDir = userId ? `data/users/${userId}/${this.baseDirName}` : this.baseDirName;
  }

  async initialize(sessionId: string): Promise<void> {
    const dir = this.fs.join(this.baseDir, sessionId);
    await this.fs.mkdir(dir, { recursive: true });
  }

  registerTaskDir(sessionId: string, taskId: string, domainDisplayName: string): void {
    const key = `${sessionId}:${taskId}`;
    const dirName = `${this.sanitize(taskId)}_${this.sanitize(domainDisplayName)}`;
    this.taskDirNames.set(key, dirName);
  }

  async writeTaskOutput(sessionId: string, taskId: string, fileName: string, content: string): Promise<void> {
    const dir = this.fs.join(this.baseDir, sessionId, this.resolveTaskDir(sessionId, taskId));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(dir, this.sanitize(fileName)), content);
  }

  async readTaskOutput(sessionId: string, taskId: string, fileName: string): Promise<string | null> {
    const filePath = this.fs.join(this.baseDir, sessionId, this.resolveTaskDir(sessionId, taskId), this.sanitize(fileName));
    return this.fs.readFile(filePath);
  }

  async listTaskFiles(sessionId: string, taskId: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId, this.resolveTaskDir(sessionId, taskId));
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

  async listTaskFilesByPath(sessionId: string, taskPath: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId, this.sanitize(taskPath));
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async readWorkspaceFile(sessionId: string, relativePath: string): Promise<string | null> {
    const safePath = relativePath.split(/[\\/]/).map((s) => this.sanitize(s)).join("/");
    return this.fs.readFile(this.fs.join(this.baseDir, sessionId, safePath));
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

  resolveTaskDirName(sessionId: string, taskId: string): string {
    return this.resolveTaskDir(sessionId, taskId);
  }

  private resolveTaskDir(sessionId: string, taskId: string): string {
    const key = `${sessionId}:${taskId}`;
    return this.taskDirNames.get(key) ?? this.sanitize(taskId);
  }

  private sanitize(segment: string): string {
    return segment
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^\.+/, "_")
      .trim() || "_";
  }
}
