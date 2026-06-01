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

  async writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
    const dir = this.fs.join(this.baseDir, sessionId, this.fs.dirname(filePath));
    await this.fs.mkdir(dir, { recursive: true });
    await this.fs.writeFile(this.fs.join(this.baseDir, sessionId, filePath), content);
  }

  async readFile(sessionId: string, filePath: string): Promise<string | null> {
    return this.fs.readFile(this.fs.join(this.baseDir, sessionId, filePath));
  }

  async listFiles(sessionId: string): Promise<string[]> {
    const dir = this.fs.join(this.baseDir, sessionId);
    const entries = await this.fs.readdir(dir);
    const files: string[] = [];
    for (const e of entries) {
      if (e.isFile) {
        files.push(e.name);
      }
    }
    return files;
  }
}
