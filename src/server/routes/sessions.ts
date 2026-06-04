import { Hono } from "hono";
import type { SessionManager } from "../../core/session/SessionManager.js";
import type { WorkspaceManager } from "../../core/workspace/WorkspaceManager.js";
import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";

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

sessionsRoute.get("/:id/files", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");

  try {
    const taskDirs = await workspaceManagerInstance.listTasks(sessionId);
    const tasks = await Promise.all(
      taskDirs.map(async (taskPath) => {
        const fileNames = await workspaceManagerInstance!.listTaskFilesByPath(sessionId, taskPath);
        const { taskId, domain } = parseTaskPath(taskPath);
        const files = await Promise.all(
          fileNames.map(async (name) => {
            const fullPath = path.join("workspace", sessionId, taskPath, name);
            let size = 0;
            try {
              const stat = await fs.stat(fullPath);
              size = stat.size;
            } catch {
              // ignore files that cannot be stated
            }
            return {
              name,
              size: formatBytes(size),
              downloadUrl: `/api/sessions/${sessionId}/files/download?path=${encodeURIComponent(
                `${taskPath}/${name}`
              )}`,
            };
          })
        );
        return {
          taskId,
          domain,
          path: taskPath,
          files,
        };
      })
    );

    return c.json({ sessionId, tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

sessionsRoute.get("/:id/files/download", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  const rawPath = c.req.query("path") ?? "";
  const safePath = sanitizeFilePath(rawPath);
  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  const fullPath = path.resolve(path.join("workspace", sessionId, safePath));
  const workspaceRoot = path.resolve(path.join("workspace", sessionId));
  if (!isWithinWorkspace(fullPath, workspaceRoot)) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const content = await fs.readFile(fullPath);
    const fileName = path.basename(safePath);
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return c.body(content);
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

sessionsRoute.get("/:id/files/zip", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  const zip = new JSZip();

  try {
    const taskDirs = await workspaceManagerInstance.listTasks(sessionId);
    for (const taskPath of taskDirs) {
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

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${sessionId}_files.zip"`);
    return c.body(new Uint8Array(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

function sanitizeFilePath(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+/, "")
    .trim();
}

function isWithinWorkspace(fullPath: string, workspaceRoot: string): boolean {
  const normalizedFile = path.normalize(fullPath);
  const normalizedRoot = path.normalize(workspaceRoot);
  return (
    normalizedFile === normalizedRoot ||
    normalizedFile.startsWith(normalizedRoot + path.sep)
  );
}

function parseTaskPath(taskPath: string): { taskId: string; domain: string } {
  const idx = taskPath.indexOf("_");
  if (idx > 0 && idx < taskPath.length - 1) {
    return {
      taskId: taskPath.slice(0, idx),
      domain: taskPath.slice(idx + 1),
    };
  }
  return { taskId: taskPath, domain: "未知" };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
