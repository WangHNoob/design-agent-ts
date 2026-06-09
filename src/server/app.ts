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

export function createApp() {
  const app = new Hono();

  app.use(cors({ origin: "*" }));
  app.use(logger());

  // User management routes (public: register/login, authenticated: /me)
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
