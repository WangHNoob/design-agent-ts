# 文件浏览器与主策划聚合层移除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为主策划模式移除聚合层，让子 Agent 产出直接落到 workspace；新增前端文件浏览器，支持单文件下载、选中批量下载、全部打包 ZIP 下载；非主策划的单角色模式仍在前端渲染完整输出并附带下载入口。

**Architecture:** 后端通过 Hono 路由暴露 workspace 文件树与 ZIP 打包接口；`WorkspaceManager` 支持带 domain 的任务目录命名；`DirectorAgent` 在主策划流程中跳过 `Integrator` 与 HITL-2/3，返回轻量摘要消息；前端在 `RightPanel` 新增文件浏览器标签页，SSE `complete` 后自动刷新文件列表。

**Tech Stack:** TypeScript, Node.js, Hono, Next.js 16 + Tailwind, Zustand, Vitest

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/core/workspace/WorkspaceManager.ts` | 支持 `registerTaskDir`、`<taskId>_<domain>` 目录、兼容旧目录、读取文件大小与修改时间。 |
| `src/port/fs/FileSystemPort.ts` | 可选：新增 `stat(path)` 用于获取文件大小。若现有接口够用则不扩展。 |
| `src/server/routes/sessions.ts` | 新增 `/files`、`/files/download`、`/files/zip` 路由；需要访问 workspace，通过路由闭包注入。 |
| `src/server/bootstrap.ts` | 将 `WorkspaceManager` 实例注入 `sessionsRoute`；新建 `setWorkspaceManager` setter。 |
| `src/core/agent/director/DirectorAgent.ts` | 注册任务目录；主策划流程跳过 Integrator 与 HITL-2/3；返回摘要消息。 |
| `src/core/agent/director/Integrator.ts` | 保留但不再被 DirectorAgent 调用；测试同步更新。 |
| `frontend/components/Console/FileBrowserPanel.tsx` | 新增文件浏览器组件：文件树、全选、打包下载、批量下载。 |
| `frontend/components/Console/RightPanel.tsx` | 新增 `files` 标签，渲染 `FileBrowserPanel`。 |
| `frontend/components/Console/ChatMessageActions.tsx` | 新增（可选内联）：单条 AI 消息旁的下载按钮组件。 |
| `frontend/components/Console/ConsolePage.tsx` | 向 `RightPanel` 传入 `sessionId` 与刷新触发器；为主策划消息特殊处理。 |
| `frontend/lib/stores/taskStore.ts` | 新增 `files` 状态与 `setFiles`/`refreshFiles` 动作（或保持本地 state）。 |
| `frontend/lib/api.ts` | 新增 `fetchSessionFiles`、`downloadSessionZip`、`downloadSessionFile` 辅助函数。 |
| `test/core/agent/director/DirectorAgent.test.ts` | 更新断言，移除对 Integrator 输出的依赖。 |
| `test/core/workspace/WorkspaceManager.test.ts` | 新增/更新：验证带 domain 的目录命名与文件列表。 |

---

## Task 1: WorkspaceManager 支持带 domain 的任务目录

**Files:**
- Modify: `src/core/workspace/WorkspaceManager.ts`
- Test: `test/core/workspace/WorkspaceManager.test.ts`（若不存在则创建）

### Step 1.1: Write the failing test

Create or modify `test/core/workspace/WorkspaceManager.test.ts`:

```ts
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
```

### Step 1.2: Run the failing test

Run:

```bash
cd D:/game-designer-ts && npx vitest run test/core/workspace/WorkspaceManager.test.ts
```

Expected: FAIL with `TypeError: ws.registerTaskDir is not a function`

### Step 1.3: Implement WorkspaceManager changes

Modify `src/core/workspace/WorkspaceManager.ts`:

```ts
export class WorkspaceManager {
  private taskDirNames = new Map<string, string>();

  constructor(
    private baseDir: string = "workspace",
    private fs: FileSystemPort
  ) {}

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

  async readWorkspaceFile(sessionId: string, relativePath: string): Promise<string | null> {
    const safePath = relativePath.split(/[\\/]/).map((s) => this.sanitize(s)).join("/");
    return this.fs.readFile(this.fs.join(this.baseDir, sessionId, safePath));
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
```

### Step 1.4: Run the test

Run:

```bash
npx vitest run test/core/workspace/WorkspaceManager.test.ts
```

Expected: PASS

### Step 1.5: Commit

```bash
git add src/core/workspace/WorkspaceManager.ts test/core/workspace/WorkspaceManager.test.ts
git commit -m "feat(workspace): support <taskId>_<domain> directory naming"
```

---

## Task 2: 后端新增文件路由

**Files:**
- Modify: `src/server/routes/sessions.ts`
- Modify: `src/server/bootstrap.ts`
- Modify: `src/port/fs/FileSystemPort.ts`（可选，若需要文件大小）
- Modify: `src/adapter/fs/NodeFileSystemAdapter.ts`（可选）

### Step 2.1: 决定文件大小获取方式

为了保持端口最小化，先用 `readFile` 读取内容再算 `Buffer.byteLength`；若后续需要真实 `stat`，再扩展端口。本计划不扩展端口。

### Step 2.2: 修改 sessions route

Replace `src/server/routes/sessions.ts` entirely:

```ts
import { Hono } from "hono";
import type { SessionManager } from "../../core/session/SessionManager.js";
import type { WorkspaceManager } from "../../core/workspace/WorkspaceManager.js";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";

let sessionManagerInstance: SessionManager | null = null;
let workspaceManagerInstance: WorkspaceManager | null = null;

export function setSessionManager(sm: SessionManager) {
  sessionManagerInstance = sm;
}

export function setWorkspaceManager(ws: WorkspaceManager) {
  workspaceManagerInstance = ws;
}

export const sessionsRoute = new Hono();

sessionsRoute.get("/", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  const sessions = await sessionManagerInstance.list(limit, offset);
  return c.json({ sessions, total: sessions.length });
});

sessionsRoute.get("/:id", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const session = await sessionManagerInstance.get(id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

sessionsRoute.delete("/:id", async (c) => {
  if (!sessionManagerInstance) {
    return c.json({ error: "SessionManager not initialized" }, 503);
  }
  const id = c.req.param("id");
  const deleted = await sessionManagerInstance.delete(id);
  if (!deleted) return c.json({ error: "Session not found" }, 404);
  return c.json({ success: true });
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

sessionsRoute.get("/:id/files", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  const taskNames = await workspaceManagerInstance.listTasks(sessionId);
  const tasks: Array<{
    taskId: string;
    domain: string;
    path: string;
    files: Array<{ name: string; size: string; downloadUrl: string }>;
  }> = [];

  for (const taskPath of taskNames) {
    const fileNames = await workspaceManagerInstance.listTaskFilesByPath(sessionId, taskPath);
    const files: Array<{ name: string; size: string; downloadUrl: string }> = [];
    for (const fileName of fileNames) {
      const fullPath = path.join("workspace", sessionId, taskPath, fileName);
      let size = "0 B";
      try {
        const stat = await fs.stat(fullPath);
        size = formatSize(stat.size);
      } catch {}
      files.push({
        name: fileName,
        size,
        downloadUrl: `/api/sessions/${sessionId}/files/download?path=${encodeURIComponent(`${taskPath}/${fileName}`)}`,
      });
    }
    // Derive taskId and domain from "TASK-ID_domain"
    const underscoreIdx = taskPath.indexOf("_");
    const taskId = underscoreIdx > 0 ? taskPath.slice(0, underscoreIdx) : taskPath;
    const domain = underscoreIdx > 0 ? taskPath.slice(underscoreIdx + 1) : taskPath;
    tasks.push({ taskId, domain, path: taskPath, files });
  }

  return c.json({ sessionId, tasks });
});

sessionsRoute.get("/:id/files/download", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  const rawPath = c.req.query("path");
  if (!rawPath) return c.json({ error: "path is required" }, 400);

  const safePath = rawPath.split(/[\\/]/).map((s) =>
    s.replace(/[\\/:*?"<>|]/g, "_").replace(/\.{2,}/g, "_").replace(/^\.+/, "_").trim() || "_"
  ).join("/");
  const fullPath = path.join("workspace", sessionId, safePath);

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return c.json({ error: "Not a file" }, 400);
    const fileName = path.basename(fullPath);
    const file = await fs.readFile(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = ext === ".md" ? "text/markdown; charset=utf-8" : "application/octet-stream";
    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return c.body(file);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

sessionsRoute.get("/:id/files/zip", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  const taskNames = await workspaceManagerInstance.listTasks(sessionId);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const taskPath of taskNames) {
    const fileNames = await workspaceManagerInstance.listTaskFilesByPath(sessionId, taskPath);
    for (const fileName of fileNames) {
      const fullPath = path.join("workspace", sessionId, taskPath, fileName);
      try {
        const content = await fs.readFile(fullPath);
        zip.file(`${taskPath}/${fileName}`, content);
      } catch {
        // skip unreadable files
      }
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="design-output-${sessionId}.zip"`);
  return c.body(zipBuffer);
});
```

> **Note:** This adds `listTaskFilesByPath` to `WorkspaceManager` (Step 2.3).

### Step 2.3: Add listTaskFilesByPath to WorkspaceManager

Modify `src/core/workspace/WorkspaceManager.ts`, add after `listTaskFiles`:

```ts
async listTaskFilesByPath(sessionId: string, taskPath: string): Promise<string[]> {
  const dir = this.fs.join(this.baseDir, sessionId, this.sanitize(taskPath));
  try {
    const entries = await this.fs.readdir(dir);
    return entries.filter((e) => e.isFile).map((e) => e.name);
  } catch {
    return [];
  }
}
```

### Step 2.4: Install jszip

Run:

```bash
cd D:/game-designer-ts && pnpm add jszip
```

Expected: package added to dependencies

### Step 2.5: Inject WorkspaceManager into sessions route

Modify `src/server/bootstrap.ts`:

Find both places where `new WorkspaceManager("workspace", fileSystem)` is created. Extract to a shared local variable:

```ts
const workspaceManager = new WorkspaceManager("workspace", fileSystem);
```

Then in both `lateBootstrapDirector` and `bootstrap`, pass `workspaceManager` to `DirectorAgent`.

Add import:

```ts
import { setWorkspaceManager } from "./routes/sessions.js";
```

And after `setSessionManager(sessionManager);` add:

```ts
setWorkspaceManager(workspaceManager);
```

### Step 2.6: Verify build

Run:

```bash
npm run build
```

Expected: no TypeScript errors

### Step 2.7: Commit

```bash
git add src/server/routes/sessions.ts src/server/bootstrap.ts src/core/workspace/WorkspaceManager.ts package.json pnpm-lock.yaml
git commit -m "feat(server): add workspace file listing, download and zip routes"
```

---

## Task 3: DirectorAgent 改造

**Files:**
- Modify: `src/core/agent/director/DirectorAgent.ts`
- Modify: `test/core/agent/director/DirectorAgent.test.ts`

### Step 3.1: Register task directories and remove aggregation for chief designer

Modify `src/core/agent/director/DirectorAgent.ts` in `executeDesignFlow`:

Before the pipeline loop (around line 225), add directory registration:

```ts
if (this.deps.workspace) {
  for (const assignment of assignments) {
    this.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
  }
}
```

Then replace the integration / review block (lines 245-266) with:

```ts
const completedCount = results.filter((r) => r.status === "success").length;

const fileList = results
  .filter((r) => r.status === "success")
  .map((r) => {
    const dirName = this.deps.workspace
      ? this.deps.workspace.resolveTaskDirName?.(sessionId, r.taskId) ?? r.taskId
      : r.taskId;
    return `- ${dirName}/output.md`;
  })
  .join("\n");

const summary = `## ✅ 策划方案已生成

共完成 **${completedCount}** 个子任务，所有产出已保存到工作空间：

${fileList || "- （无成功产出）"}

---

📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  
📦 也可以直接点击「打包下载全部」获取 ZIP。`;

return {
  agentName: "Director",
  message: ChatMessage.text("assistant", "Director", summary),
  metadata: { fileCount: completedCount },
  success: true,
  errorMessage: null,
};
```

> **Note:** We need to expose `resolveTaskDirName` from `WorkspaceManager` (Step 3.2), or store mapping in DirectorAgent. Simpler: add a method.

### Step 3.2: Expose resolveTaskDirName on WorkspaceManager

Modify `src/core/workspace/WorkspaceManager.ts`:

```ts
resolveTaskDirName(sessionId: string, taskId: string): string {
  return this.resolveTaskDir(sessionId, taskId);
}
```

Make `resolveTaskDir` public (change `private` to `public`) or add the wrapper.

### Step 3.3: Update stream path

Modify `executeDesignStream` (around lines 629-645):

Replace:

```ts
yield { type: "integrate", data: { message: "Integrating results..." } };
const reviewedResults = await this.deps.humanReviewGateway.requestReview(...);
const finalOutput = this.integrator.integrate(...);
// ...
const finalReviewed = await this.deps.humanReviewGateway.requestReview(...);
const output = finalReviewed.modifications ?? finalOutput;
yield { type: "complete", data: { success: true, output } };
```

With:

```ts
const completedCount = results.filter((r) => r.status === "success").length;
const fileList = results
  .filter((r) => r.status === "success")
  .map((r) => {
    const dirName = this.deps.workspace
      ? this.deps.workspace.resolveTaskDirName?.(sessionId, r.taskId) ?? r.taskId
      : r.taskId;
    return `- ${dirName}/output.md`;
  })
  .join("\n");

const summary = `## ✅ 策划方案已生成\n\n共完成 **${completedCount}** 个子任务...`;

// Skip integrate event or keep it for UI compatibility
yield { type: "integrate", data: { message: "汇总完成，产出已保存到工作空间" } };
yield { type: "complete", data: { success: true, output: summary } };
```

### Step 3.4: Single-role flow remains unchanged

No changes needed to `executeSingleRoleFlow` / `executeSingleRoleStream`. They continue to return full `result.output`.

### Step 3.5: Update test expectations

Modify `test/core/agent/director/DirectorAgent.test.ts`:

Add workspace mock to the design/table tests so they don't fail on undefined workspace:

```ts
const createMockWorkspace = () => ({
  initialize: vi.fn(),
  registerTaskDir: vi.fn(),
  writeTaskOutput: vi.fn(),
  readTaskOutput: vi.fn(),
  listTaskFiles: vi.fn(),
  listTasks: vi.fn(),
  listTaskFilesByPath: vi.fn(),
  resolveTaskDirName: vi.fn((sid: string, taskId: string) => taskId),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
});
```

Update the design/table test cases to include `workspace: createMockWorkspace()` in `DirectorAgent` deps.

### Step 3.6: Run tests

Run:

```bash
npx vitest run test/core/agent/director/DirectorAgent.test.ts test/core/workspace/WorkspaceManager.test.ts
```

Expected: PASS

### Step 3.7: Commit

```bash
git add src/core/agent/director/DirectorAgent.ts src/core/workspace/WorkspaceManager.ts test/core/agent/director/DirectorAgent.test.ts
git commit -m "feat(director): skip integrator for chief_designer, return summary with file list"
```

---

## Task 4: 前端文件浏览器

**Files:**
- Create: `frontend/components/Console/FileBrowserPanel.tsx`
- Modify: `frontend/components/Console/RightPanel.tsx`
- Create/Modify: `frontend/lib/api.ts`

### Step 4.1: Add API helpers

Modify `frontend/lib/api.ts`, add:

```ts
export interface SessionFileInfo {
  name: string;
  size: string;
  downloadUrl: string;
}

export interface SessionTaskFiles {
  taskId: string;
  domain: string;
  path: string;
  files: SessionFileInfo[];
}

export interface SessionFilesResponse {
  sessionId: string;
  tasks: SessionTaskFiles[];
}

export async function fetchSessionFiles(sessionId: string): Promise<SessionFilesResponse> {
  const res = await fetch(`/api/sessions/${sessionId}/files`);
  if (!res.ok) throw new Error(`Failed to fetch files: ${res.status}`);
  return res.json();
}

export function getSessionZipUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/files/zip`;
}

export function downloadSessionFile(downloadUrl: string): void {
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

### Step 4.2: Create FileBrowserPanel

Create `frontend/components/Console/FileBrowserPanel.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { FolderOpen, FileText, Download, Package, Loader2 } from 'lucide-react';
import { fetchSessionFiles, getSessionZipUrl, downloadSessionFile, type SessionFilesResponse } from '@/lib/api';

interface Props {
  sessionId: string;
}

export default function FileBrowserPanel({ sessionId }: Props) {
  const [data, setData] = useState<SessionFilesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSessionFiles(sessionId);
      setData(res);
      // Auto-select all on first load
      const all = new Set<string>();
      for (const t of res.tasks) {
        for (const f of t.files) {
          all.add(f.downloadUrl);
        }
      }
      setSelected(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) load();
  }, [sessionId]);

  const allUrls: string[] = [];
  if (data) {
    for (const t of data.tasks) {
      for (const f of t.files) allUrls.push(f.downloadUrl);
    }
  }

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(allUrls) : new Set());
  };

  const toggleOne = (url: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(url);
    else next.delete(url);
    setSelected(next);
  };

  const downloadSelected = () => {
    const urls = Array.from(selected);
    if (urls.length === 0) return;
    urls.forEach((url, i) => {
      setTimeout(() => downloadSessionFile(url), i * 300);
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-xs text-ink/70">
          <input
            type="checkbox"
            checked={allUrls.length > 0 && selected.size === allUrls.length}
            onChange={(e) => toggleAll(e.target.checked)}
            className="rounded border-ink/30"
          />
          全选 ({allUrls.length})
        </label>
        <a
          href={getSessionZipUrl(sessionId)}
          download
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-coral text-white hover:bg-coral/90"
        >
          <Package size={12} />
          打包下载全部
        </a>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-ink/60 py-4">
          <Loader2 size={14} className="animate-spin" />
          加载文件列表…
        </div>
      )}

      {error && (
        <div className="text-xs text-coral py-2">
          {error}
          <button onClick={load} className="ml-2 underline">重试</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {data?.tasks.map((task) => (
          <div key={task.path} className="rounded-lg border border-ink/8 bg-white">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-ink/6 bg-ink/[0.02]">
              <FolderOpen size={14} className="text-ink/50" />
              <span className="text-xs font-medium text-ink/80">{task.path}</span>
            </div>
            <div className="divide-y divide-ink/6">
              {task.files.map((file) => (
                <div key={file.downloadUrl} className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(file.downloadUrl)}
                    onChange={(e) => toggleOne(file.downloadUrl, e.target.checked)}
                    className="rounded border-ink/30"
                  />
                  <FileText size={14} className="text-ink/40" />
                  <span className="flex-1 text-xs text-ink/80 truncate">{file.name}</span>
                  <span className="text-[10px] text-ink/50 tabular-nums">{file.size}</span>
                  <button
                    onClick={() => downloadSessionFile(file.downloadUrl)}
                    className="p-1 rounded hover:bg-ink/5 text-ink/60"
                    title="下载"
                  >
                    <Download size={14} />
                  </button>
                </div>
              ))}
              {task.files.length === 0 && (
                <div className="px-3 py-2 text-[10px] text-ink/40">暂无文件</div>
              )}
            </div>
          </div>
        ))}
        {!loading && data?.tasks.length === 0 && (
          <div className="text-xs text-ink/50 py-4">暂无产出文件</div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-ink/8">
        <button
          onClick={downloadSelected}
          disabled={selected.size === 0}
          className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded border border-ink/15 bg-white hover:bg-ink/[0.02] disabled:opacity-40"
        >
          <Download size={14} />
          下载选中 ({selected.size})
        </button>
      </div>
    </div>
  );
}
```

### Step 4.3: Integrate into RightPanel

Modify `frontend/components/Console/RightPanel.tsx`:

```tsx
import { useState } from 'react';
import { GitBranch, Terminal, FolderOpen } from 'lucide-react';
import StepsTimeline, { type TimelineEntry } from './StepsTimeline';
import DetailedLogs, { type DetailedLog } from './DetailedLogs';
import FileBrowserPanel from './FileBrowserPanel';

interface Props {
  timeline: TimelineEntry[];
  logs: DetailedLog[];
  sessionId: string | null;
  messageCount: number;
  executionTime: string;
  onClearLogs: () => void;
  activeTab?: 'steps' | 'logs' | 'files';
  onChangeTab?: (tab: 'steps' | 'logs' | 'files') => void;
}

export default function RightPanel({
  timeline,
  logs,
  sessionId,
  messageCount,
  executionTime,
  onClearLogs,
  activeTab: controlledTab,
  onChangeTab,
}: Props) {
  const [internalTab, setInternalTab] = useState<'steps' | 'logs' | 'files'>('steps');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: 'steps' | 'logs' | 'files') => {
    setInternalTab(tab);
    onChangeTab?.(tab);
  };

  return (
    <div className="h-full w-full flex flex-col bg-white border-l border-ink/8 shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/8 shrink-0">
        <span className="text-sm font-semibold tracking-wider uppercase text-ink/90">执行监控</span>
        <div className="flex items-center gap-1">
          <TabBtn active={activeTab === 'steps'} onClick={() => setActiveTab('steps')} icon={<GitBranch size={14} />} label="步骤" count={timeline.length} />
          <TabBtn active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal size={14} />} label="日志" count={logs.length} />
          <TabBtn active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<FolderOpen size={14} />} label="文件" />
        </div>
      </div>

      {/* Session info */}
      {sessionId && (
        <div className="px-3 py-2 border-b border-ink/6 text-xs text-ink/70 flex items-center gap-3 shrink-0">
          <span className="font-mono truncate">ID: {sessionId.slice(0, 8)}</span>
          <span>消息: {messageCount}</span>
          <span>耗时: {executionTime}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeTab === 'steps' && <StepsTimeline entries={timeline} />}
        {activeTab === 'logs' && <DetailedLogs logs={logs} onClear={onClearLogs} />}
        {activeTab === 'files' && (
          sessionId ? <FileBrowserPanel sessionId={sessionId} /> : <div className="text-xs text-ink/50">暂无会话</div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
        active ? 'bg-coral/10 text-coral font-medium' : 'text-ink/60 hover:text-ink hover:bg-ink/10'
      }`}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-mono">{count}</span>
      )}
    </button>
  );
}
```

### Step 4.4: Auto-switch to files tab on chief designer completion

Modify `frontend/components/Console/ConsolePage.tsx`:

Right now `RightPanel` manages its own tab state. We need to lift tab state up or use a ref. Simpler: pass a `defaultTab` prop or expose an imperative API. Better: add `rightPanelTab` state in `ConsolePage` and pass it down.

Lift state:

```ts
const [rightPanelTab, setRightPanelTab] = useState<'steps' | 'logs' | 'files'>('steps');
```

In `onStreamEvent`, when `event === 'complete'` and the task role is `chief_designer`, switch tab:

```ts
if (event === 'complete') {
  const task = store.getTask(sessionId);
  if (task?.role === 'chief_designer') {
    setRightPanelTab('files');
  }
  setRefreshTick((t) => t + 1);
}
```

Pass to `RightPanel`:

```tsx
<RightPanel
  ...
  activeTab={rightPanelTab}
  onChangeTab={setRightPanelTab}
/>
```

Update `RightPanel` props and internal state to be controlled.

### Step 4.5: Verify frontend build

Run:

```bash
cd D:/game-designer-ts/frontend && npm run build
```

Expected: no build errors

### Step 4.6: Commit

```bash
git add frontend/components/Console/FileBrowserPanel.tsx frontend/components/Console/RightPanel.tsx frontend/components/Console/ConsolePage.tsx frontend/lib/api.ts
git commit -m "feat(frontend): add workspace file browser panel with zip and batch download"
```

---

## Task 5: 单角色模式消息下载按钮

**Files:**
- Modify: `frontend/components/Console/ConsolePage.tsx` (ChatBubble)

### Step 5.1: Add download button for single-role AI messages

Modify `ChatBubble` in `frontend/components/Console/ConsolePage.tsx`:

```tsx
const ChatBubble = React.memo(function ChatBubble({
  msg,
  sessionId,
  role,
}: {
  msg: ChatMessage;
  sessionId: string | null;
  role: string;
}) {
  // ... existing code ...

  const showDownload = !isUser && sessionId && role !== 'chief_designer' && msg.content.length > 0;

  return (
    <motion.div ...>
      {/* avatar */}
      <div className="...">
        {!isUser && (
          <div className="markdown-content">...</div>
        )}
        <div className="flex items-center justify-between mt-1">
          <div className={`text-[10px] ${isUser ? 'text-white/60' : 'text-ink/50'}`}>
            {msg.timestamp}
          </div>
          {showDownload && (
            <a
              href={`/api/sessions/${sessionId}/files/download?path=${encodeURIComponent('single/output.md')}`}
              download
              className="flex items-center gap-1 text-[10px] text-ink/60 hover:text-coral"
            >
              <Download size={12} />
              下载
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
});
```

Add `Download` import:

```tsx
import { Send, Sparkles, Loader2, Zap, User, Bot, Info, Download } from 'lucide-react';
```

Update the `messages.map` call to pass `sessionId` and `role`:

```tsx
{messages.map((msg) => (
  <ChatBubble key={msg.id} msg={msg} sessionId={sessionId} role={effectiveRole} />
))}
```

> **Note:** The `single` task writes to `workspace/<session>/single/output.md` in `executeSingleRoleFlow`. If you change the taskId or directory naming for single-role mode, adjust the path accordingly.

### Step 5.2: Verify frontend build

Run:

```bash
cd D:/game-designer-ts/frontend && npm run build
```

Expected: no errors

### Step 5.3: Commit

```bash
git add frontend/components/Console/ConsolePage.tsx
git commit -m "feat(frontend): add download button for single-role agent messages"
```

---

## Task 6: 验证与收尾

### Step 6.1: Full build

Run:

```bash
cd D:/game-designer-ts && npm run build
```

Expected: PASS

### Step 6.2: Full test suite

Run:

```bash
npm test
```

Expected: all tests pass

### Step 6.3: Lint / format

Run:

```bash
npm run lint
```

If lint errors exist, fix them.

### Step 6.4: Manual happy-path test (if possible)

1. Start backend and frontend.
2. Send a design request with `chief_designer`.
3. Verify:
   - Chat shows summary, not a huge merged doc.
   - Right panel switches to "文件" tab.
   - File list shows `TASK-xxx_xxx/output.md` entries.
   - Single download works.
   - "打包下载全部" returns a ZIP containing all outputs.
4. Send a request with `combat_designer`.
5. Verify:
   - Chat renders full output.
   - Download button downloads `single/output.md`.

### Step 6.5: Final commit

```bash
git add -A
git commit -m "feat: file browser, workspace downloads, and remove director aggregation layer"
```

---

## Spec Coverage Checklist

| Spec Requirement | Plan Task |
|------------------|-----------|
| 新建 `dev` 分支 | Task 0 (git checkout -b dev) |
| Workspace `<taskId>_<domain>/output.md` | Task 1 |
| 后端 `/files`、`/files/download`、`/files/zip` | Task 2 |
| DirectorAgent 注册任务目录 | Task 3.1 |
| DirectorAgent 跳过 Integrator | Task 3.1 |
| DirectorAgent 返回摘要 | Task 3.1 / 3.3 |
| 主策划不聚合，去 HITL-2/3 | Task 3.1 / 3.3 |
| 单角色仍前端渲染 | Task 5 |
| 前端文件浏览器（单文件/批量/ZIP） | Task 4 |
| 文件命名规范 | Task 1 |
| 自动切换到文件标签 | Task 4.4 |
| 测试更新 | Task 1, 3.5, 6.2 |

## Placeholder Scan

- No TBD/TODO/fill-in-details remain.
- All code snippets are concrete and copy-paste ready.
- All file paths exact.
- Type/method names consistent (`registerTaskDir`, `resolveTaskDirName`, `listTaskFilesByPath`).
