import type { WorkflowTask, Domain, OutputType } from "../schema/TaskPlan.js";

function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  return match ? match[1]! : null;
}

function extractQuoted(yaml: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*"([^"]*)"`, "m");
  const m = yaml.match(re);
  return m ? m[1]!.trim() : "";
}

function extractStringList(yaml: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, "m");
  const m = yaml.match(re);
  if (!m) return [];
  return (m[1]!.match(/-\s+"[^"\n]*"|-\s+[^"\n]+/g) ?? [])
    .map((s) => s.replace(/^-\s+/, "").replace(/^"(.*)"$/, "$1").trim())
    .filter((s) => s.length > 0);
}

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
  const taskIdMatch = block.match(/^\s*-?\s*taskId:\s*"([^"]*)"/m);
  if (!taskIdMatch) return null;
  const taskId = taskIdMatch[1]!.trim();

  const domainRaw = extractQuoted(block, "\\s*domain");
  const domain = domainRaw.toLowerCase() as Domain;

  let requirementTemplate = "";
  const reqMatch = block.match(/requirement:\s*\|\s*\n([\s\S]*?)(?=\n\s{4}\w)/);
  if (reqMatch) {
    requirementTemplate = reqMatch[1]!
      .split("\n")
      .map((l) => l.replace(/^\s{6}/, ""))
      .join("\n")
      .trim();
  } else {
    requirementTemplate = extractQuoted(block, "\\s*requirement");
  }

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

export interface WorkflowDefinition {
  name: string;
  description: string;
  keywords: string[];
  tasks: WorkflowTask[];
  /** Frontmatter mcpTools patterns for on-demand MCP exposure. */
  mcpTools: string[];
}

export function parseWorkflowContent(content: string): WorkflowDefinition | null {
  const yaml = extractFrontmatter(content);
  if (!yaml) return null;

  const name = extractQuoted(yaml, "name");
  const description = extractQuoted(yaml, "description");
  if (!name) return null;

  const keywords = extractStringList(yaml, "keywords");
  const mcpTools = extractStringList(yaml, "mcpTools");
  const tasks = parseTasks(yaml);

  return { name, description, keywords, tasks, mcpTools };
}
