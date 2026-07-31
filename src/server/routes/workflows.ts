import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { WORKFLOWS_DIR, parseWorkflowFile } from "../WorkflowLoader.js";
import { reloadDirector, getBootstrapState } from "../bootstrap.js";
import { hasActiveExecutions } from "./console.js";
import type { Domain, OutputType } from "../../core/schema/TaskPlan.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import { requireAdmin } from "../middleware/auth.js";

export const workflowsRoute = new Hono();

const VALID_DOMAINS: Domain[] = [
  "system_design", "combat_design", "numerical_planning",
  "gameplay_design", "executive_planning", "qa",
];
const VALID_OUTPUT_TYPES: OutputType[] = ["DOCUMENT", "CONFIG_TABLE", "MIXED"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a SKILL.md file from a structured workflow definition. */
function buildWorkflowMarkdown(def: {
  name: string;
  description: string;
  keywords: string[];
  tasks: Array<{
    taskId: string;
    domain: string;
    requirement: string;
    dependencies: string[];
    outputType: string;
    outputTemplate: string;
  }>;
  body?: string;
}): string {
  const kwList = def.keywords.map((k) => `  - "${k}"`).join("\n");

  const taskBlocks = def.tasks.map((t) => {
    const deps = t.dependencies.length === 0
      ? "[]"
      : "\n" + t.dependencies.map((d) => `      - "${d}"`).join("\n");
    const req = t.requirement.includes("\n")
      ? `|\n${t.requirement.split("\n").map((l) => `      ${l}`).join("\n")}`
      : `"${t.requirement}"`;
    return `  - taskId: "${t.taskId}"
    domain: "${t.domain}"
    requirement: ${req}
    dependencies: ${deps}
    outputType: "${t.outputType}"
    outputTemplate: "${t.outputTemplate}"`;
  }).join("\n");

  const body = def.body ?? `\n# ${def.name}\n\n${def.description}\n`;

  return `---
name: "${def.name}"
description: "${def.description}"
keywords:
${kwList}
tasks:
${taskBlocks}
---

${body}`;
}

/** Validate a workflow definition structure. Returns array of error messages. */
function validateWorkflowDef(def: {
  name: string;
  description: string;
  keywords: string[];
  tasks: Array<{
    taskId: string;
    domain: string;
    requirement: string;
    dependencies: string[];
    outputType: string;
    outputTemplate: string;
  }>;
}): string[] {
  const errors: string[] = [];

  if (!def.name || !/^[a-zA-Z0-9_-]+$/.test(def.name)) {
    errors.push("name 必须为字母、数字、下划线或连字符");
  }
  if (!def.description) {
    errors.push("description 不能为空");
  }
  if (!def.keywords || def.keywords.length === 0) {
    errors.push("至少需要一个 keyword");
  }
  if (!def.tasks || def.tasks.length === 0) {
    errors.push("至少需要一个 task");
  }

  const taskIds = new Set<string>();
  for (let i = 0; i < (def.tasks ?? []).length; i++) {
    const t = def.tasks![i]!;
    const prefix = `tasks[${i}]`;

    if (!t.taskId) {
      errors.push(`${prefix}: taskId 不能为空`);
    } else if (taskIds.has(t.taskId)) {
      errors.push(`${prefix}: taskId '${t.taskId}' 重复`);
    }
    taskIds.add(t.taskId);

    if (!VALID_DOMAINS.includes(t.domain as Domain)) {
      errors.push(`${prefix}: domain '${t.domain}' 不合法，可选: ${VALID_DOMAINS.join(", ")}`);
    }
    if (!VALID_OUTPUT_TYPES.includes(t.outputType as OutputType)) {
      errors.push(`${prefix}: outputType '${t.outputType}' 不合法，可选: ${VALID_OUTPUT_TYPES.join(", ")}`);
    }
    for (const dep of t.dependencies ?? []) {
      if (dep && !taskIds.has(dep)) {
        errors.push(`${prefix}: 依赖 '${dep}' 必须在当前任务之前定义`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/workflows
 * List all workflows with name, description, keywords, and task count.
 */
workflowsRoute.get("/", (c) => {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    return c.json({ workflows: [] });
  }

  const entries = fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
  const workflows: Array<{
    name: string;
    description: string;
    keywords: string[];
    taskCount: number;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(WORKFLOWS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;

    const def = parseWorkflowFile(skillPath);
    if (!def) continue;

    workflows.push({
      name: def.name,
      description: def.description,
      keywords: def.keywords,
      taskCount: def.tasks.length,
    });
  }

  return c.json({ workflows, validDomains: VALID_DOMAINS, validOutputTypes: VALID_OUTPUT_TYPES });
});

/**
 * GET /api/workflows/:name
 * Get full parsed definition and raw content of a specific workflow.
 */
workflowsRoute.get("/:name", (c) => {
  const name = c.req.param("name")!;
  const skillPath = path.join(WORKFLOWS_DIR, name, "SKILL.md");

  if (!fs.existsSync(skillPath)) {
    return c.json({ error: `Workflow '${name}' not found` }, 404);
  }

  const def = parseWorkflowFile(skillPath);
  if (!def) {
    return c.json({ error: `Failed to parse workflow '${name}'` }, 500);
  }

  return c.json({
    name: def.name,
    description: def.description,
    keywords: def.keywords,
    tasks: def.tasks,
    content: def.content,
  });
});

/**
 * PUT /api/workflows/:name
 * Create or update a workflow.
 * Body can be:
 *   - { content: string }  — raw SKILL.md content
 *   - { name, description, keywords, tasks, body? }  — structured definition
 */
workflowsRoute.put("/:name", requireAdmin(), async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const dirName = c.req.param("name")!;
  if (!/^[a-zA-Z0-9_-]+$/.test(dirName)) {
    return c.json({ success: false, error: "Invalid workflow name" }, 400);
  }

  const body = await c.req.json();
  let content: string;

  if (typeof body.content === "string") {
    content = body.content;
  } else if (body.name && body.tasks) {
    // Structured input
    const def = {
      name: body.name,
      description: body.description ?? "",
      keywords: body.keywords ?? [],
      tasks: body.tasks,
      body: body.body,
    };

    const errors = validateWorkflowDef(def);
    if (errors.length > 0) {
      return c.json({ success: false, error: "Validation failed", errors }, 400);
    }

    // Enforce directory name match
    if (def.name !== dirName) {
      return c.json({ success: false, error: `Workflow name '${def.name}' must match directory '${dirName}'` }, 400);
    }

    content = buildWorkflowMarkdown(def);
  } else {
    return c.json({ success: false, error: "Provide 'content' or { name, description, keywords, tasks }" }, 400);
  }

  // Write the file
  const workflowDir = path.join(WORKFLOWS_DIR, dirName);
  if (!fs.existsSync(workflowDir)) {
    fs.mkdirSync(workflowDir, { recursive: true });
  }

  const skillPath = path.join(workflowDir, "SKILL.md");
  const isNew = !fs.existsSync(skillPath);
  fs.writeFileSync(skillPath, content, "utf-8");

  // Validate the written file parses correctly
  const parsed = parseWorkflowFile(skillPath);
  if (!parsed) {
    // Rollback on failure
    if (isNew) {
      fs.rmSync(workflowDir, { recursive: true, force: true });
    }
    return c.json({ success: false, error: "Written file failed to parse as valid workflow" }, 400);
  }

  try {
    await reloadDirector();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `File saved but reload failed: ${msg}` }, 500);
  }

  return c.json({
    success: true,
    name: dirName,
    isNew,
    taskCount: parsed.tasks.length,
    keywords: parsed.keywords,
  });
});

/**
 * DELETE /api/workflows/:name
 * Delete a workflow (move to trash).
 */
workflowsRoute.delete("/:name", requireAdmin(), async (c) => {
  if (hasActiveExecutions()) {
    return c.json({ success: false, error: "无法在任务执行中修改配置" }, 409);
  }

  const name = c.req.param("name")!;
  const workflowDir = path.join(WORKFLOWS_DIR, name);

  if (!fs.existsSync(workflowDir)) {
    return c.json({ error: `Workflow '${name}' not found` }, 404);
  }

  // Move to trash
  const trashDir = path.resolve(".trash", "workflows");
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  fs.renameSync(workflowDir, path.join(trashDir, name));

  try {
    await reloadDirector();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `Deleted but reload failed: ${msg}` }, 500);
  }

  return c.json({ success: true, name });
});

/**
 * POST /api/workflows/validate
 * Validate a workflow definition without saving.
 */
workflowsRoute.post("/validate", requireAdmin(), async (c) => {
  const body = await c.req.json();

  if (typeof body.content === "string") {
    // Write to a temp file, try to parse, clean up
    const tmpPath = path.join(WORKFLOWS_DIR, "__validate_tmp", "SKILL.md");
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, body.content, "utf-8");
    const parsed = parseWorkflowFile(tmpPath);
    fs.rmSync(path.join(WORKFLOWS_DIR, "__validate_tmp"), { recursive: true, force: true });

    if (!parsed) {
      return c.json({ valid: false, errors: ["Failed to parse workflow file"] });
    }
    return c.json({
      valid: true,
      name: parsed.name,
      taskCount: parsed.tasks.length,
      keywords: parsed.keywords,
    });
  }

  // Structured validation
  const errors = validateWorkflowDef(body);
  return c.json({ valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined });
});

/**
 * POST /api/workflows/llm-generate
 * Use the configured LLM to assist with workflow content generation.
 * Body: { prompt: string, context?: string }
 */
workflowsRoute.post("/llm-generate", requireAdmin(), async (c) => {
  const state = getBootstrapState();
  if (!state?.container) {
    return c.json({ error: "LLM not configured. Set up API key in settings first." }, 503);
  }

  const body = await c.req.json<{ prompt: string; context?: string }>();
  if (!body.prompt) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const systemPrompt = `你是一个游戏设计工作流助手。你帮助用户设计工作流的任务描述、需求模板、关键词等内容。
请用 JSON 格式返回结果。只输出 JSON，不要其他内容。

当前可用的 domain 值: ${VALID_DOMAINS.join(", ")}
当前可用的 outputType 值: ${VALID_OUTPUT_TYPES.join(", ")}

domain 含义:
- system_design: 系统策划，负责规则设计、流程设计、状态机
- combat_design: 战斗策划，负责战斗机制、技能设计、平衡性
- numerical_planning: 数值策划，负责公式设计、成长曲线、经济平衡
- gameplay_design: 玩法策划，负责核心玩法、关卡设计
- executive_planning: 执行策划，负责开发排期、里程碑规划
- qa: QA测试，负责测试用例、质量验证`;

  const messages: ChatMessage[] = [
    ChatMessage.text("system", "system", systemPrompt),
  ];

  if (body.context) {
    messages.push(ChatMessage.text("user", "user", `当前工作流上下文:\n${body.context}`));
  }

  messages.push(ChatMessage.text("user", "user", body.prompt));

  try {
    const response = await state.container.model.generate(messages, { temperature: 0.7 });
    const text = ChatMessage.textContent(response.message);

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(text);
      return c.json({ success: true, data: parsed, raw: text });
    } catch {
      // Not JSON, return raw text
      return c.json({ success: true, data: text, raw: text });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: `LLM generation failed: ${msg}` }, 500);
  }
});
