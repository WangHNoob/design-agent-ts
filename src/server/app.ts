import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { consoleRoute } from "./routes/console.js";
import { sessionsRoute } from "./routes/sessions.js";
import { hitlRoute } from "./routes/hitl.js";
import { settingsRoute } from "./routes/settings.js";
import { promptsRoute } from "./routes/prompts.js";
import { skillsRoute } from "./routes/skills.js";
import { workflowsRoute } from "./routes/workflows.js";
import { usersRoute } from "./routes/users.js";
import { tracesRoute } from "./routes/traces.js";
import { auditRoute } from "./routes/audit.js";
import { costRoute } from "./routes/cost.js";
import { versionsRoute } from "./routes/versions.js";
import type { BetterAuthAdapter } from "../adapter/betterauth/BetterAuthAdapter.js";
import type { TenantIsolationPort } from "../port/user/TenantIsolationPort.js";
import type { TenantContext } from "../port/user/TenantIsolationPort.js";
import type { DatabasePort } from "../port/infra/DatabasePort.js";
import type { ContextStoragePort } from "../port/infra/ContextStoragePort.js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";

let betterAuthAdapter: BetterAuthAdapter | null = null;
let tenantPort: TenantIsolationPort | null = null;
let tenantContextStorage: ContextStoragePort<TenantContext> | null = null;
let databasePort: DatabasePort | null = null;
let corsTrustedOrigins: string[] = [];

export function setAuthAdapter(adapter: BetterAuthAdapter) {
  betterAuthAdapter = adapter;
}

export function setTenantPort(port: TenantIsolationPort) {
  tenantPort = port;
}

export function setTenantContextStorage(storage: ContextStoragePort<TenantContext>) {
  tenantContextStorage = storage;
}

export function setDatabasePort(db: DatabasePort) {
  databasePort = db;
}

/** Wire TRUSTED_ORIGINS into the CORS origin check (comma-separated list). */
export function setCorsTrustedOrigins(origins: string[]) {
  corsTrustedOrigins = origins;
}

export function createApp() {
  const app = new Hono();

  app.use(cors({
    origin: (origin) => {
      // Allow localhost on common dev/Docker ports, plus TRUSTED_ORIGINS.
      const allowed = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
      ];
      if (!origin || allowed.some((p) => p.test(origin))) return origin;
      if (corsTrustedOrigins.includes(origin)) return origin;
      // Unknown origin: emit no CORS headers so the browser blocks the response.
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "Last-Event-ID"],
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "DELETE"],
    exposeHeaders: ["Content-Length", "Set-Cookie", "X-Execution-Id", "X-Session-Id"],
    maxAge: 600,
    credentials: true,
  }));
  app.use(logger());

  // ─── Better Auth Handler ───────────────────────────────────────
  // Mount Better Auth endpoints at /api/auth/*
  // Handles: /api/auth/sign-up/email, /api/auth/sign-in/email,
  //          /api/auth/sign-out, /api/auth/get-session, etc.
  if (betterAuthAdapter) {
    const adapter = betterAuthAdapter;
    app.on(["POST", "GET"], "/api/auth/*", (c) => {
      return adapter.auth.handler(c.req.raw);
    });
  }

  // ─── Auth Middleware (tenant resolution) ───────────────────────
  // Resolves Better Auth session → TenantContext for all /api/* routes,
  // then protects business API routes by default.
  if (tenantPort) {
    if (!tenantContextStorage) {
      throw new Error("Tenant context storage is not configured");
    }
    app.use("/api/*", authMiddleware(tenantPort, tenantContextStorage));
    app.use("/api/*", requireAuth());
  }

  // ─── Application Routes ────────────────────────────────────────
  app.route("/api/users", usersRoute);
  app.route("/api/console", consoleRoute);
  app.route("/api/sessions", sessionsRoute);
  app.route("/api/traces", tracesRoute);
  app.route("/api/audit", auditRoute);
  app.route("/api/cost", costRoute);
  app.route("/api/hitl", hitlRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/prompts", promptsRoute);
  app.route("/api/skills", skillsRoute);
  app.route("/api/workflows", workflowsRoute);
  app.route("/api/versions", versionsRoute);

  // ─── Health & Monitoring ───────────────────────────────────────
  app.get("/health", async (c) => {
    const checks: Record<string, "ok" | "error"> = {};

    // PostgreSQL
    if (databasePort) {
      checks.postgres = (await databasePort.healthCheck()) ? "ok" : "error";
    }

    // Redis (via TenantIsolationPort)
    if (tenantPort) {
      checks.redis = (await tenantPort.healthCheck()) ? "ok" : "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");
    return c.json({ status: allOk ? "ok" : "degraded", checks }, allOk ? 200 : 503);
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (c) => {
    const metrics: string[] = [];
    const now = Date.now();

    // Basic process metrics
    const memUsage = process.memoryUsage();
    metrics.push(`# HELP process_memory_heap_used_bytes Process heap memory used in bytes`);
    metrics.push(`# TYPE process_memory_heap_used_bytes gauge`);
    metrics.push(`process_memory_heap_used_bytes ${memUsage.heapUsed}`);
    metrics.push(`# HELP process_memory_heap_total_bytes Process heap memory total in bytes`);
    metrics.push(`# TYPE process_memory_heap_total_bytes gauge`);
    metrics.push(`process_memory_heap_total_bytes ${memUsage.heapTotal}`);
    metrics.push(`# HELP process_memory_rss_bytes Process RSS memory in bytes`);
    metrics.push(`# TYPE process_memory_rss_bytes gauge`);
    metrics.push(`process_memory_rss_bytes ${memUsage.rss}`);

    // Uptime
    metrics.push(`# HELP process_uptime_seconds Process uptime in seconds`);
    metrics.push(`# TYPE process_uptime_seconds gauge`);
    metrics.push(`process_uptime_seconds ${process.uptime()}`);

    // Database health
    if (databasePort) {
      const dbOk = await databasePort.healthCheck();
      metrics.push(`# HELP app_postgres_up PostgreSQL connection status (1=up, 0=down)`);
      metrics.push(`# TYPE app_postgres_up gauge`);
      metrics.push(`app_postgres_up ${dbOk ? 1 : 0}`);
    }

    // Redis health
    if (tenantPort) {
      const redisOk = await tenantPort.healthCheck();
      metrics.push(`# HELP app_redis_up Redis connection status (1=up, 0=down)`);
      metrics.push(`# TYPE app_redis_up gauge`);
      metrics.push(`app_redis_up ${redisOk ? 1 : 0}`);
    }

    // HTTP request counter (basic — from logger)
    metrics.push(`# HELP http_requests_total Total HTTP requests`);
    metrics.push(`# TYPE http_requests_total counter`);
    metrics.push(`http_requests_total 0`);

    metrics.push(`# HELP app_info Application info`);
    metrics.push(`# TYPE app_info gauge`);
    metrics.push(`app_info{version="1.0.0"} 1`);

    c.header("Content-Type", "text/plain; version=0.0.4");
    return c.body(metrics.join("\n") + "\n");
  });

  return app;
}

export const app = createApp();
