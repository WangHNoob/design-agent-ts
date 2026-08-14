import { Hono } from "hono";
import type { DatabasePort } from "../../port/infra/DatabasePort.js";

/**
 * 用户侧信号（flywheel 03-P4 任务 4）：策划对 Agent 输出的复制 / 评分。
 * 落 user_signal_events（共享表，观测台采样器读取，作为在线评测第 4 采样源）。
 * 只写不读业务逻辑；鉴权走全局 /api/* authMiddleware + requireAuth。
 */

let db: DatabasePort | null = null;

export function setUserSignalDatabase(next: DatabasePort): void {
  db = next;
}

export const userSignalsRoute = new Hono();

userSignalsRoute.post("/", async (c) => {
  if (!db) {
    return c.json({ error: "User signal persistence not configured" }, 503);
  }
  const tenant = c.get("tenant") ?? undefined;
  const userId = tenant?.userId ?? "";
  if (!userId) {
    return c.json({ error: "Missing tenant context" }, 401);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    kind?: string;
    sessionId?: string;
    executionId?: string;
    traceId?: string;
    rating?: number;
  };
  if (body.kind !== "copied" && body.kind !== "rated") {
    return c.json({ error: "kind must be copied | rated" }, 400);
  }
  const rating =
    body.kind === "rated"
      ? Number.isInteger(body.rating) && body.rating! >= 1 && body.rating! <= 5
        ? body.rating
        : null
      : null;
  const id = `us_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.query(
    `INSERT INTO user_signal_events
      (id, user_id, session_id, execution_id, trace_id, kind, rating, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    {
      1: id,
      2: userId,
      3: typeof body.sessionId === "string" ? body.sessionId : "",
      4: typeof body.executionId === "string" ? body.executionId : "",
      5: typeof body.traceId === "string" ? body.traceId : "",
      6: body.kind,
      7: rating,
      8: new Date().toISOString(),
    },
  );
  return c.json({ recorded: true, id });
});
