import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { consoleRoute } from "./routes/console.js";
import { sessionsRoute } from "./routes/sessions.js";
import { hitlRoute } from "./routes/hitl.js";

export function createApp() {
  const app = new Hono();

  app.use(cors({ origin: "*" }));
  app.use(logger());

  app.route("/api/console", consoleRoute);
  app.route("/api/sessions", sessionsRoute);
  app.route("/api/hitl", hitlRoute);

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}

export const app = createApp();
