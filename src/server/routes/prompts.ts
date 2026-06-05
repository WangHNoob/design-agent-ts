import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { loadPrompt, clearPromptCache } from "../PromptLoader.js";
import { reloadDirector } from "../bootstrap.js";
import { hasActiveExecutions } from "./console.js";

const PROMPTS_DIR = path.resolve("prompts");

/** Known prompt file names (without .md) used at bootstrap. */
const KNOWN_PROMPTS = [
  "system_designer",
  "combat_designer",
  "numerical_planner",
  "gameplay_designer",
  "executive_planner",
  "qa_planner",
  "query_knowledge",
  "task_planner_freeform",
  "router_classify",
  "director",
  "clarify_system",
  "clarify_user_requirement",
  "task_planner_refine",
];

export const promptsRoute = new Hono();

/**
 * GET /api/prompts
 * List all prompt files with name and first-line preview.
 */
promptsRoute.get("/", (c) => {
  if (!fs.existsSync(PROMPTS_DIR)) {
    return c.json({ prompts: [] });
  }

  const files = fs.readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md"));
  const prompts = files.map((file) => {
    const name = file.replace(/\.md$/, "");
    const filePath = path.join(PROMPTS_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    // First non-empty line as preview
    const preview = content.split("\n").find((l) => l.trim().length > 0) ?? "";
    return {
      name,
      preview: preview.slice(0, 120),
      size: content.length,
      isBuiltin: KNOWN_PROMPTS.includes(name),
    };
  });

  return c.json({ prompts });
});

/**
 * GET /api/prompts/:name
 * Get full content of a specific prompt.
 */
promptsRoute.get("/:name", (c) => {
  const name = c.req.param("name");
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return c.json({ error: `Prompt '${name}' not found` }, 404);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return c.json({
    name,
    content,
    isBuiltin: KNOWN_PROMPTS.includes(name),
  });
});

/**
 * PUT /api/prompts/:name
 * Create or update a prompt file.
 */
promptsRoute.put("/:name", async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const name = c.req.param("name");
  // Sanitize name: only allow alphanumeric, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return c.json({ success: false, error: "Invalid prompt name" }, 400);
  }

  const body = await c.req.json<{ content: string }>();
  if (typeof body.content !== "string") {
    return c.json({ success: false, error: "content is required" }, 400);
  }

  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  const isNew = !fs.existsSync(filePath);

  fs.writeFileSync(filePath, body.content, "utf-8");
  clearPromptCache();

  // Hot-reload if this is a known prompt that affects agent behavior
  if (KNOWN_PROMPTS.includes(name)) {
    try {
      await reloadDirector();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: `File saved but reload failed: ${msg}` }, 500);
    }
  }

  return c.json({ success: true, name, isNew });
});

/**
 * DELETE /api/prompts/:name
 * Delete a prompt file. Protected prompts cannot be deleted.
 */
promptsRoute.delete("/:name", async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const name = c.req.param("name");
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    return c.json({ error: `Prompt '${name}' not found` }, 404);
  }

  // Prevent deleting critical prompts
  const protectedPrompts = [
    "system_designer", "combat_designer", "numerical_planner",
    "gameplay_designer", "executive_planner", "qa_planner",
    "query_knowledge", "task_planner_freeform", "router_classify",
  ];
  if (protectedPrompts.includes(name)) {
    return c.json({ success: false, error: `Cannot delete protected prompt '${name}'` }, 403);
  }

  // Move to trash instead of permanent delete
  const trashDir = path.resolve(".trash");
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(filePath, path.join(trashDir, `${name}.md`));

  clearPromptCache();

  return c.json({ success: true, name });
});
