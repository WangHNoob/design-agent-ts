import { Hono } from "hono";
import type { WorkspaceManager } from "../../core/workspace/WorkspaceManager.js";
import type { SessionRepository } from "../../port/session/SessionRepository.js";
import type { ExecutionRepository } from "../../port/execution/ExecutionRepository.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import JSZip from "jszip";

export type SessionRepositoryFactory = (userId: string) => SessionRepository;
export type ExecutionRepositoryFactory = (userId: string) => ExecutionRepository;

let sessionRepositoryFactory: SessionRepositoryFactory | null = null;
let executionRepositoryFactoryInjected: ExecutionRepositoryFactory | null = null;
let workspaceManagerInstance: WorkspaceManager | null = null;

export function setSessionRepositoryFactory(factory: SessionRepositoryFactory) {
  sessionRepositoryFactory = factory;
}

export function setExecutionRepositoryFactory(factory: ExecutionRepositoryFactory) {
  executionRepositoryFactoryInjected = factory;
}

export function setWorkspaceManager(ws: WorkspaceManager) {
  workspaceManagerInstance = ws;
}

function isValidSessionId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export const sessionsRoute = new Hono();

sessionsRoute.get("/", async (c) => {
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const repository = factory((c.get("tenant") as TenantContext).userId);
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  const sessions = await repository.list(limit, offset);

  // 附带每个会话最新执行的 executionId，供前端回放历史执行监控
  let result = sessions;
  if (executionRepositoryFactoryInjected) {
    const executionRepository = executionRepositoryFactoryInjected(
      (c.get("tenant") as TenantContext).userId
    );
    result = await Promise.all(
      sessions.map(async (session) => {
        try {
          const [latest] = await executionRepository.list({
            sessionId: session.id,
            limit: 1,
          });
          return { ...session, executionId: latest?.id ?? null };
        } catch {
          return { ...session, executionId: null };
        }
      })
    );
  }

  return c.json({ sessions: result, total: result.length });
});

sessionsRoute.get("/:id", async (c) => {
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const id = c.req.param("id");
  const session = await factory((c.get("tenant") as TenantContext).userId).get(id);
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

// 多轮回放：按时间正序重建会话历史轮次（每轮 = 用户需求 + 助手产出）。
// 事件流只持久化最近一次执行的可回放监控，重选会话时更早轮次只能从
// executions 的 requestPayload.requirement / resultPayload.output 还原。
sessionsRoute.get("/:id/messages", async (c) => {
  if (!executionRepositoryFactoryInjected) {
    return c.json({ error: "ExecutionRepository not initialized" }, 503);
  }
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  if (!isValidSessionId(sessionId)) {
    return c.json({ error: "Invalid session id" }, 400);
  }
  const userId = (c.get("tenant") as TenantContext).userId;
  const session = await factory(userId).get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const limit = Number(c.req.query("limit") ?? "20");
  const capped = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 20;
  // list 按 created_at DESC 返回，反转为时间正序
  const executions = (
    await executionRepositoryFactoryInjected(userId).list({ sessionId, limit: capped })
  ).reverse();

  const turns = executions
    .map((execution) => {
      const rawSources = execution.resultPayload?.knowledgeSources;
      return {
        executionId: execution.id,
        status: execution.status,
        mode: execution.mode ?? null,
        createdAt: execution.createdAt,
        requirement:
          typeof execution.requestPayload?.requirement === "string"
            ? execution.requestPayload.requirement
            : "",
        output:
          typeof execution.resultPayload?.output === "string"
            ? execution.resultPayload.output
            : "",
        // 本轮引用的知识库证据（resultPayload 持久化；旧执行无此字段）
        knowledgeSources: Array.isArray(rawSources)
          ? rawSources.filter(
              (s): s is Record<string, unknown> =>
                typeof s === "object" && s !== null && typeof (s as { id?: unknown }).id === "string",
            )
          : [],
        error: execution.errorMessage ?? null,
      };
    })
    .filter((turn) => turn.requirement.length > 0);

  return c.json({ sessionId, turns });
});

sessionsRoute.delete("/:id", async (c) => {
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const id = c.req.param("id");
  const deleted = await factory((c.get("tenant") as TenantContext).userId).delete(id);
  if (!deleted) return c.json({ error: "Session not found" }, 404);
  return c.json({ success: true });
});

sessionsRoute.get("/:id/files", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  if (!isValidSessionId(sessionId)) {
    return c.json({ error: "Invalid session id" }, 400);
  }
  const repository = factory((c.get("tenant") as TenantContext).userId);
  const session = await repository.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  try {
    const taskDirs = await workspaceManagerInstance.listTasks(sessionId);
    const tasks = await Promise.all(
      taskDirs.map(async (taskPath) => {
        const fileNames = await workspaceManagerInstance!.listTaskFilesByPath(sessionId, taskPath);
        const { taskId, domain } = parseTaskPath(taskPath);
        const files = await Promise.all(
          fileNames.map(async (name) => {
            const content = await workspaceManagerInstance!.readWorkspaceFile(
              sessionId,
              `${taskPath}/${name}`,
            );
            const size = content === null ? 0 : Buffer.byteLength(content);
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
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  if (!isValidSessionId(sessionId)) {
    return c.json({ error: "Invalid session id" }, 400);
  }
  const session = await factory((c.get("tenant") as TenantContext).userId).get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  const rawPath = c.req.query("path") ?? "";
  const safePath = sanitizeFilePath(rawPath);
  if (!safePath) {
    return c.json({ error: "Invalid path" }, 400);
  }

  try {
    const content = await workspaceManagerInstance.readWorkspaceFile(sessionId, safePath);
    if (content === null) return c.json({ error: "File not found" }, 404);
    const fileName = safePath.split("/").at(-1) ?? "download";
    const contentType = fileName.toLowerCase().endsWith(".md")
      ? "text/markdown; charset=utf-8"
      : "application/octet-stream";
    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    return c.body(new TextEncoder().encode(content));
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

sessionsRoute.get("/:id/files/zip", async (c) => {
  if (!workspaceManagerInstance) {
    return c.json({ error: "WorkspaceManager not initialized" }, 503);
  }
  const factory = sessionRepositoryFactory;
  if (!factory) {
    return c.json({ error: "SessionRepository not initialized" }, 503);
  }
  const sessionId = c.req.param("id");
  if (!isValidSessionId(sessionId)) {
    return c.json({ error: "Invalid session id" }, 400);
  }
  const session = await factory((c.get("tenant") as TenantContext).userId).get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  const zip = new JSZip();

  try {
    const taskDirs = await workspaceManagerInstance.listTasks(sessionId);
    for (const taskPath of taskDirs) {
      const fileNames = await workspaceManagerInstance.listTaskFilesByPath(sessionId, taskPath);
      for (const fileName of fileNames) {
        try {
          const content = await workspaceManagerInstance.readWorkspaceFile(
            sessionId,
            `${taskPath}/${fileName}`,
          );
          if (content === null) continue;
          zip.file(`${taskPath}/${fileName}`, content);
        } catch {
          // skip unreadable files
        }
      }
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="design-output-${sessionId}.zip"`);
    return c.body(new Uint8Array(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

function sanitizeFilePath(input: string): string {
  return input
    .split("/")
    .map((segment) =>
      segment
        .replace(/[\\:*?"<>|]/g, "_")
        .replace(/\.{2,}/g, "_")
        .replace(/^\.+/, "")
        .trim()
    )
    .filter((s) => s.length > 0)
    .join("/");
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
