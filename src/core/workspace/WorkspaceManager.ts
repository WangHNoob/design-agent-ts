import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";
import type { ContextStoragePort } from "../../port/infra/ContextStoragePort.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";

export class WorkspaceManager {
  private taskDirNames = new Map<string, string>();

  constructor(
    private readonly baseDirName: string = "workspace",
    private readonly fs: FileSystemPort,
    private readonly contextStorage: ContextStoragePort<TenantContext>,
  ) {}

  async initialize(sessionId: string): Promise<void> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId));
    await this.fs.mkdir(dir, { recursive: true });
  }

  registerTaskDir(sessionId: string, taskId: string, domainDisplayName: string): void {
    const key = this.taskKey(sessionId, taskId);
    const dirName = `${this.sanitize(taskId)}_${this.sanitize(domainDisplayName)}`;
    this.taskDirNames.set(key, dirName);
  }

  async writeTaskOutput(sessionId: string, taskId: string, fileName: string, content: string): Promise<void> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId), this.resolveTaskDir(sessionId, taskId));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(dir, this.sanitize(fileName)), content);
  }

  async readTaskOutput(sessionId: string, taskId: string, fileName: string): Promise<string | null> {
    const filePath = this.fs.join(
      this.tenantBaseDir(),
      this.sanitize(sessionId),
      this.resolveTaskDir(sessionId, taskId),
      this.sanitize(fileName),
    );
    return this.fs.readFile(filePath);
  }

  async listTaskFiles(sessionId: string, taskId: string): Promise<string[]> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId), this.resolveTaskDir(sessionId, taskId));
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async listTasks(sessionId: string): Promise<string[]> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId));
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isDirectory).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async listTaskFilesByPath(sessionId: string, taskPath: string): Promise<string[]> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId), this.sanitize(taskPath));
    try {
      const entries = await this.fs.readdir(dir);
      return entries.filter((e) => e.isFile).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async readWorkspaceFile(sessionId: string, relativePath: string): Promise<string | null> {
    const safePath = this.sanitizeRelativePath(relativePath);
    return this.fs.readFile(this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId), safePath));
  }

  // Legacy flat methods (kept for backward compat)
  async writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
    const safePath = this.sanitizeRelativePath(filePath);
    const baseDir = this.tenantBaseDir();
    const safeSessionId = this.sanitize(sessionId);
    const dir = this.fs.join(baseDir, safeSessionId, this.fs.dirname(safePath));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(baseDir, safeSessionId, safePath), content);
  }

  async readFile(sessionId: string, filePath: string): Promise<string | null> {
    return this.readWorkspaceFile(sessionId, filePath);
  }

  async listFiles(sessionId: string): Promise<string[]> {
    const dir = this.fs.join(this.tenantBaseDir(), this.sanitize(sessionId));
    const entries = await this.fs.readdir(dir);
    return entries.filter((e) => e.isFile).map((e) => e.name);
  }

  resolveTaskDirName(sessionId: string, taskId: string): string {
    return this.resolveTaskDir(sessionId, taskId);
  }

  private resolveTaskDir(sessionId: string, taskId: string): string {
    const key = this.taskKey(sessionId, taskId);
    return this.taskDirNames.get(key) ?? this.sanitize(taskId);
  }

  private taskKey(sessionId: string, taskId: string): string {
    return `${this.currentUserId()}:${this.sanitize(sessionId)}:${this.sanitize(taskId)}`;
  }

  private tenantBaseDir(): string {
    return this.fs.join("data", "users", this.currentUserId(), this.baseDirName);
  }

  private currentUserId(): string {
    const userId = this.contextStorage.getStore()?.userId;
    if (!userId) {
      throw new Error("Tenant context is required for workspace access");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      throw new Error("Tenant context contains an invalid userId");
    }
    return userId;
  }

  private sanitizeRelativePath(relativePath: string): string {
    const segments = relativePath
      .split(/[\\/]/)
      .filter((segment) => segment.length > 0)
      .map((segment) => this.sanitize(segment));
    if (segments.length === 0) {
      throw new Error("Workspace file path is required");
    }
    return this.fs.join(...segments);
  }

  private sanitize(segment: string): string {
    return segment
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^\.+/, "_")
      .trim() || "_";
  }
}
