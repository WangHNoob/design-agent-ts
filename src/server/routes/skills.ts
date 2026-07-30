import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { SKILLS_DIR, parseFrontmatter } from "../SkillLoader.js";
import { reloadDirector } from "../bootstrap.js";
import { hasActiveExecutions } from "./console.js";
import { requireAdmin } from "../middleware/auth.js";

export const skillsRoute = new Hono();

/**
 * GET /api/skills
 * List all skills with name, description, and content size.
 */
skillsRoute.get("/", (c) => {
  if (!fs.existsSync(SKILLS_DIR)) {
    return c.json({ skills: [] });
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills: Array<{ name: string; description: string; size: number }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) continue;

    skills.push({
      name: fm.name,
      description: fm.description,
      size: content.length,
    });
  }

  return c.json({ skills });
});

/**
 * GET /api/skills/:name
 * Get full content of a specific skill.
 */
skillsRoute.get("/:name", (c) => {
  const name = c.req.param("name")!;
  const skillPath = path.join(SKILLS_DIR, name, "SKILL.md");

  if (!fs.existsSync(skillPath)) {
    return c.json({ error: `Skill '${name}' not found` }, 404);
  }

  const content = fs.readFileSync(skillPath, "utf-8");
  const fm = parseFrontmatter(content);

  return c.json({
    name: fm?.name ?? name,
    description: fm?.description ?? "",
    content,
  });
});

/**
 * PUT /api/skills/:name
 * Create or update a skill. Body: { content: string } or { name, description, body }
 */
skillsRoute.put("/:name", requireAdmin(), async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const dirName = c.req.param("name")!;
  if (!/^[a-zA-Z0-9_-]+$/.test(dirName)) {
    return c.json({ success: false, error: "Invalid skill name" }, 400);
  }

  const body = await c.req.json<{ content?: string; name?: string; description?: string; skillBody?: string }>();

  let content: string;

  if (typeof body.content === "string") {
    // Raw markdown content provided
    content = body.content;
  } else if (body.name && body.skillBody !== undefined) {
    // Structured input: build SKILL.md with frontmatter
    const desc = body.description ?? "";
    content = `---\nname: "${body.name}"\ndescription: "${desc}"\n---\n\n${body.skillBody}`;
  } else {
    return c.json({ success: false, error: "Provide 'content' or { name, description, skillBody }" }, 400);
  }

  // Validate frontmatter
  const fm = parseFrontmatter(content);
  if (!fm) {
    return c.json({ success: false, error: "Invalid SKILL.md format: missing frontmatter" }, 400);
  }

  // Enforce directory/skill name consistency
  if (fm.name !== dirName) {
    return c.json({ success: false, error: `Skill name '${fm.name}' must match directory name '${dirName}'` }, 400);
  }

  const skillDir = path.join(SKILLS_DIR, dirName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const skillPath = path.join(skillDir, "SKILL.md");
  const isNew = !fs.existsSync(skillPath);
  fs.writeFileSync(skillPath, content, "utf-8");

  try {
    await reloadDirector();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `File saved but reload failed: ${msg}` }, 500);
  }

  return c.json({ success: true, name: dirName, isNew });
});

/**
 * DELETE /api/skills/:name
 * Delete a skill (move to trash).
 */
skillsRoute.delete("/:name", requireAdmin(), async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const name = c.req.param("name")!;
  const skillDir = path.join(SKILLS_DIR, name);

  if (!fs.existsSync(skillDir)) {
    return c.json({ error: `Skill '${name}' not found` }, 404);
  }

  // Move to trash
  const trashDir = path.resolve(".trash", "skills");
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(skillDir, path.join(trashDir, name));

  try {
    await reloadDirector();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Deleted but reload failed: ${msg}` }, 500);
  }

  return c.json({ success: true, name });
});
