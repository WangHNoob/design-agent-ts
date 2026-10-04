import { serve } from "@hono/node-server";
import { bootstrap, getBootstrapState } from "./bootstrap.js";

const port = Number(process.env.PORT ?? 3000);
const SHUTDOWN_TIMEOUT_MS = 10_000;

// 演示部署兜底：未捕获的异步异常只记录不退出（默认行为是整进程崩溃，
// 曾导致 HITL 计划校验异常触发 502 崩溃循环）。根因仍需逐个修复。
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled rejection (kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception (kept alive):", err);
});

bootstrap().then(({ app }) => {
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Server is running on http://localhost:${port}`);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}).catch((err) => {
  console.error("Failed to bootstrap:", err);
  process.exit(1);
});

/**
 * Graceful shutdown: stop the execution worker first (it drains the in-flight
 * queue claim), then close Redis/MQ/event-store/Postgres connections. A hard
 * timeout forces exit if draining hangs (queue visibility timeout still
 * reclaims pending messages on the next start).
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[Shutdown] ${signal} received, draining...`);
  const forceTimer = setTimeout(() => {
    console.error(`[Shutdown] Timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  const state = getBootstrapState();
  if (!state) {
    console.warn("[Shutdown] No bootstrap state, exiting");
    process.exit(0);
  }

  try {
    await state.executionWorker?.stop();
    await state.mqAdapter?.close();
    await state.eventStore?.close();
    await state.redisAdapter?.close();
    await state.dbAdapter?.close();
    console.log("[Shutdown] Clean shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("[Shutdown] Error during shutdown:", err);
    process.exit(1);
  }
}
