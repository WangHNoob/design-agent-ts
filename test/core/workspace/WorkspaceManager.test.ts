import { describe, it, expect } from "vitest";
import { WorkspaceManager } from "../../../src/core/workspace/WorkspaceManager.js";

class FakeFS {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.dirs.add(path);
  }
  async readdir(path: string): Promise<{ name: string; isFile: boolean; isDirectory: boolean }[]> {
    const entries: { name: string; isFile: boolean; isDirectory: boolean }[] = [];
    const seen = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(path + "/") || key.startsWith(path + "\\")) {
        const rest = key.slice(path.length + 1);
        const first = rest.split(/[\\/]/)[0];
        if (!seen.has(first)) {
          seen.add(first);
          entries.push({ name: first, isFile: !rest.includes("/") && !rest.includes("\\"), isDirectory: rest.includes("/") || rest.includes("\\") });
        }
      }
    }
    for (const d of this.dirs) {
      if (d.startsWith(path + "/") || d.startsWith(path + "\\")) {
        const rest = d.slice(path.length + 1);
        const first = rest.split(/[\\/]/)[0];
        if (!seen.has(first)) {
          seen.add(first);
          entries.push({ name: first, isFile: false, isDirectory: true });
        }
      }
    }
    return entries;
  }
  async unlink(): Promise<void> {}
  join(...segments: string[]): string {
    return segments.join("/");
  }
  dirname(filePath: string): string {
    return filePath.split("/").slice(0, -1).join("/");
  }
  relative(): string {
    return "";
  }
}

describe("WorkspaceManager", () => {
  it("registerTaskDir + writeTaskOutput writes to <taskId>_<domain>/output.md", async () => {
    const fs = new FakeFS();
    const ws = new WorkspaceManager("workspace", fs as any);
    await ws.initialize("sid-1");
    ws.registerTaskDir("sid-1", "TASK-001", "玩法设计");
    await ws.writeTaskOutput("sid-1", "TASK-001", "output.md", "# 玩法设计\n");

    const content = await ws.readTaskOutput("sid-1", "TASK-001", "output.md");
    expect(content).toBe("# 玩法设计\n");

    const tasks = await ws.listTasks("sid-1");
    expect(tasks).toContain("TASK-001_玩法设计");
  });

  it("listTaskFiles lists files under mapped directory", async () => {
    const fs = new FakeFS();
    const ws = new WorkspaceManager("workspace", fs as any);
    await ws.initialize("sid-1");
    ws.registerTaskDir("sid-1", "TASK-002", "数值规划");
    await ws.writeTaskOutput("sid-1", "TASK-002", "output.md", "numbers");
    const files = await ws.listTaskFiles("sid-1", "TASK-002");
    expect(files).toEqual(["output.md"]);
  });
});
