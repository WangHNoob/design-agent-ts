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
import type { BetterAuthAdapter } from "../adapter/betterauth/BetterAuthAdapter.js";
import type { TenantIsolationPort } from "../port/user/TenantIsolationPort.js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";

let betterAuthAdapter: BetterAuthAdapter | null = null;
let tenantPort: TenantIsolationPort | null = null;

export function setAuthAdapter(adapter: BetterAuthAdapter) {
  betterAuthAdapter = adapter;
}

export function setTenantPort(port: TenantIsolationPort) {
  tenantPort = port;
}

export function createApp() {
  const app = new Hono();

  app.use(cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS", "PUT", "DELETE"],
    exposeHeaders: ["Content-Length"],
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
    app.use("/api/*", authMiddleware(tenantPort));
    app.use("/api/*", requireAuth());
  }

  // ─── Application Routes ────────────────────────────────────────
  app.route("/api/users", usersRoute);
  app.route("/api/console", consoleRoute);
  app.route("/api/sessions", sessionsRoute);
  app.route("/api/hitl", hitlRoute);
  app.route("/api/settings", settingsRoute);
  app.route("/api/prompts", promptsRoute);
  app.route("/api/skills", skillsRoute);
  app.route("/api/workflows", workflowsRoute);

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}

export const app = createApp();
