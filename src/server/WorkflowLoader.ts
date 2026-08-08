import fs from "fs";
import path from "path";
import type { WorkflowTask, Domain, OutputType } from "../core/schema/TaskPlan.js";
import { WorkflowSkill } from "../core/skill/WorkflowSkill.js";
import type { SkillRegistry } from "../port/skill/SkillRegistry.js";

export const WORKFLOWS_DIR = path.resolve("contrib", "workflows");

// ---------------------------------------------------------------------------
// YAML frontmatter helpers (lightweight, no external dependency)
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  return match ? match[1]! : null;
}

/** Extract a double-quoted scalar value for a given key. */
function extractQuoted(yaml: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*"([^"]*)"`, "m");
  const m = yaml.match(re);
  return m ? m[1]!.trim() : "";
}

/** Extract a simple string list (  - "value" or  - value). */
function extractStringList(yaml: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, "m");
  const m = yaml.match(re);
  if (!m) return [];
  return (m[1]!.match(/-\s+"[^"\n]*"|-\s+[^"\n]+/g) ?? [])
    .map((s) => s.replace(/^-\s+/, "").replace(/^"(.*)"$/, "$1").trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Task parsing
// ---------------------------------------------------------------------------

const TASK_BOUNDARY = /^\s{2}-\s+taskId:/m;

function splitTaskBlocks(tasksSection: string): string[] {
  const lines = tasksSection.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (TASK_BOUNDARY.test(line) && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }
  return blocks;
}

function parseTaskBlock(block: string): WorkflowTask | null {
  // The first field `taskId` is on the list item line: `  - taskId: "VALUE"`
  // The `  - ` prefix is NOT whitespace, so we need a special regex.
  const taskIdMatch = block.match(/^\s*-?\s*taskId:\s*"([^"]*)"/m);
  if (!taskIdMatch) return null;
  const taskId = taskIdMatch[1]!.trim();

  const domainRaw = extractQuoted(block, "\\s*domain");
  const domain = domainRaw.toLowerCase() as Domain;

  // ---- requirement (multi-line, after `requirement: |`) ----
  let requirementTemplate: string;
  const reqMatch = block.match(/requirement:\s*\|\s*\n([\s\S]*?)(?=\n\s{4}\w)/);
  if (reqMatch) {
    requirementTemplate = reqMatch[1]!
      .split("\n")
      .map((l) => l.replace(/^\s{6}/, "")) // strip 6-space indent
      .join("\n")
      .trim();
  } else {
    // Single-line fallback
    requirementTemplate = extractQuoted(block, "\\s*requirement");
  }

  // ---- dependencies ----
  let dependencies: string[] = [];
  const depEmpty = block.match(/dependencies:\s*\[\s*\]/);
  if (!depEmpty) {
    const depMatch = block.match(/dependencies:\s*\n([\s\S]*?)(?=\n\s{4}\w)/);
    if (depMatch) {
      dependencies = (depMatch[1]!.match(/-\s+"([^"]+)"/g) ?? [])
        .map((s) => s.replace(/^-\s+"/, "").replace(/"$/, ""));
    }
  }

  const outputType = (extractQuoted(block, "\\s*outputType") || "DOCUMENT") as OutputType;
  const outputTemplate = extractQuoted(block, "\\s*outputTemplate");

  let allowedTools: string[] | undefined;
  const toolsEmpty = block.match(/allowedTools:\s*\[\s*\]/);
  if (toolsEmpty) {
    allowedTools = [];
  } else {
    const toolsMatch = block.match(/allowedTools:\s*\n([\s\S]*?)(?=\n\s{4}\w|$)/);
    if (toolsMatch) {
      allowedTools = (toolsMatch[1]!.match(/-\s+"([^"]+)"/g) ?? [])
        .map((s) => s.replace(/^-\s+"/, "").replace(/"$/, ""));
    } else {
      const inline = block.match(/allowedTools:\s*\[([^\]]*)\]/);
      if (inline) {
        allowedTools = (inline[1]!.match(/"([^"]+)"/g) ?? [])
          .map((s) => s.replace(/^"/, "").replace(/"$/, ""));
      }
    }
  }

  return {
    taskId,
    domain,
    requirementTemplate,
    dependencies,
    outputType,
    outputTemplate,
    ...(allowedTools !== undefined ? { allowedTools } : {}),
  };
}

function parseTasks(yaml: string): WorkflowTask[] {
  const tasksMatch = yaml.match(/^tasks:\s*\n([\s\S]*)$/m);
  if (!tasksMatch) return [];

  const blocks = splitTaskBlocks(tasksMatch[1]!);
  const tasks: WorkflowTask[] = [];

  for (const block of blocks) {
    const task = parseTaskBlock(block);
    if (task) tasks.push(task);
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WorkflowDefinition {
  name: string;
  description: string;
  keywords: string[];
  tasks: WorkflowTask[];
  content: string;
  mcpTools: string[];
}

/**
 * Parse a single workflow SKILL.md file and return its definition, or null on failure.
 */
export function parseWorkflowFile(filePath: string): WorkflowDefinition | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const yaml = extractFrontmatter(content);
  if (!yaml) return null;

  const name = extractQuoted(yaml, "name");
  const description = extractQuoted(yaml, "description");
  if (!name) return null;

  const keywords = extractStringList(yaml, "keywords");
  const mcpTools = extractStringList(yaml, "mcpTools");
  const tasks = parseTasks(yaml);

  return { name, description, keywords, tasks, content, mcpTools };
}

/**
 * Load all workflow definitions from contrib/workflows/ and register them
 * into the given SkillRegistry.
 */
export function loadWorkflows(registry: SkillRegistry): void {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    console.warn(`[WorkflowLoader] Workflows directory not found: ${WORKFLOWS_DIR}`);
    return;
  }

  const entries = fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
  let loaded = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(WORKFLOWS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      console.warn(`[WorkflowLoader] SKILL.md not found in ${entry.name}`);
      continue;
    }

    const def = parseWorkflowFile(skillPath);
    if (!def) {
      console.warn(`[WorkflowLoader] Failed to parse ${entry.name}`);
      continue;
    }

    if (entry.name !== def.name) {
      console.warn(
        `[WorkflowLoader] Naming mismatch: directory "${entry.name}" does not match workflow name "${def.name}". Skipping.`
      );
      continue;
    }

    const skill = new WorkflowSkill(
      def.name,
      def.description,
      def.keywords,
      def.tasks,
      def.content,
      def.mcpTools,
    );
    registry.register(skill);
    console.log(
      `[WorkflowLoader] Registered workflow: ${def.name} (${def.tasks.length} tasks, ${def.keywords.length} keywords)`
    );
    loaded++;
  }

  console.log(`[WorkflowLoader] Loaded ${loaded} workflow(s).`);
}
