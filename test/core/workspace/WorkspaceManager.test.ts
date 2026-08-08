import { describe, it, expect } from "vitest";
import { WorkspaceManager } from "../../../src/core/workspace/WorkspaceManager.js";
import { NodeContextStorageAdapter } from "../../../src/adapter/infra/NodeContextStorageAdapter.js";
import type { TenantContext } from "../../../src/port/user/TenantIsolationPort.js";

class FakeFS {
  private files = new Map<string, string>();
  private dirs = new Set<string>();

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
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
  filePaths(): string[] {
    return [...this.files.keys()];
  }
}

const tenant = (userId: string): TenantContext => ({
  userId,
  role: "user",
  sessionId: `auth-${userId}`,
});

describe("WorkspaceManager", () => {
  it("registerTaskDir + writeTaskOutput writes to <taskId>_<domain>/output.md", async () => {
    const fs = new FakeFS();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", fs as any, storage);
    await storage.run(tenant("user-a"), async () => {
      await ws.initialize("sid-1");
      ws.registerTaskDir("sid-1", "TASK-001", "玩法设计");
      await ws.writeTaskOutput("sid-1", "TASK-001", "output.md", "# 玩法设计\n");

      const content = await ws.readTaskOutput("sid-1", "TASK-001", "output.md");
      expect(content).toBe("# 玩法设计\n");

      const tasks = await ws.listTasks("sid-1");
      expect(tasks).toContain("TASK-001_玩法设计");
    });
    expect(fs.filePaths()).toEqual([
      "data/users/user-a/workspace/sid-1/TASK-001_玩法设计/output.md",
    ]);
  });

  it("listTaskFiles lists files under mapped directory", async () => {
    const fs = new FakeFS();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", fs as any, storage);
    await storage.run(tenant("user-a"), async () => {
      await ws.initialize("sid-1");
      ws.registerTaskDir("sid-1", "TASK-002", "数值规划");
      await ws.writeTaskOutput("sid-1", "TASK-002", "output.md", "numbers");
      const files = await ws.listTaskFiles("sid-1", "TASK-002");
      expect(files).toEqual(["output.md"]);
    });
  });

  it("listTaskFilesByPath lists files under a task directory path", async () => {
    const fs = new FakeFS();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", fs as any, storage);
    await storage.run(tenant("user-a"), async () => {
      await ws.initialize("sid-1");
      ws.registerTaskDir("sid-1", "TASK-001", "玩法设计");
      await ws.writeTaskOutput("sid-1", "TASK-001", "output.md", "# 玩法设计\n");
      const files = await ws.listTaskFilesByPath("sid-1", "TASK-001_玩法设计");
      expect(files).toEqual(["output.md"]);
    });
  });

  it("resolveTaskDirName returns the mapped directory name for a task", async () => {
    const fs = new FakeFS();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", fs as any, storage);
    await storage.run(tenant("user-a"), async () => {
      await ws.initialize("sid-1");
      ws.registerTaskDir("sid-1", "TASK-001", "玩法设计");
      const dirName = ws.resolveTaskDirName("sid-1", "TASK-001");
      expect(dirName).toBe("TASK-001_玩法设计");
    });
  });

  it("fails closed without a tenant context", async () => {
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", new FakeFS() as any, storage);
    await expect(ws.initialize("sid-1")).rejects.toThrow("Tenant context is required");
  });

  it("isolates parallel workspace writes by the current ALS user", async () => {
    const fs = new FakeFS();
    const storage = new NodeContextStorageAdapter<TenantContext>();
    const ws = new WorkspaceManager("workspace", fs as any, storage);

    await Promise.all([
      storage.run(tenant("user-a"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await ws.writeFile("same-session", "output.md", "A");
      }),
      storage.run(tenant("user-b"), async () => {
        await ws.writeFile("same-session", "output.md", "B");
      }),
    ]);

    expect(fs.filePaths().sort()).toEqual([
      "data/users/user-a/workspace/same-session/output.md",
      "data/users/user-b/workspace/same-session/output.md",
    ]);
  });
});
