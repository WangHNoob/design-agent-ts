import fs from "fs/promises";
import path from "path";

export class WorkspaceManager {
  constructor(private baseDir: string = "workspace") {}

  async initialize(sessionId: string): Promise<void> {
    const dir = path.join(this.baseDir, sessionId);
    await fs.mkdir(dir, { recursive: true });
  }

  async writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
    const dir = path.join(this.baseDir, sessionId, path.dirname(filePath));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(this.baseDir, sessionId, filePath), content, "utf-8");
  }

  async readFile(sessionId: string, filePath: string): Promise<string | null> {
    try {
      const data = await fs.readFile(path.join(this.baseDir, sessionId, filePath), "utf-8");
      return data;
    } catch {
      return null;
    }
  }

  async listFiles(sessionId: string): Promise<string[]> {
    try {
      const dir = path.join(this.baseDir, sessionId);
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => path.join(path.relative(dir, e.parentPath), e.name).replace(/\\/g, "/"));
    } catch {
      return [];
    }
  }
}
