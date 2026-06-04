import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan, SubTask } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { type Role, canAccessDomain } from "../../schema/Role.js";

const DEFAULT_PROMPT_TEMPLATE = `Plan the following requirement into sub-tasks (JSON format).

Role: {role}
{skillHint}Requirement: {requirement}

Output format:
{
  "planId": "auto",
  "subTasks": [
    { "id": "T1", "fragmentId": "F1", "domain": "system_design", "description": "...", "dependencies": [], "priority": 1 }
  ]
}`;

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

function normalizeSubTasks(raw: unknown[]): SubTask[] {
  return raw.map((item: unknown, idx: number) => {
    const t = item as Record<string, unknown>;
    const id = (t.id ?? t.taskId ?? `T${idx + 1}`) as string;
    const domain = ((t.domain as string) ?? "system_design").toLowerCase().replace(/-/g, "_");
    return {
      id,
      fragmentId: (t.fragmentId ?? id) as string,
      domain: domain as SubTask["domain"],
      description: (t.description ?? t.requirement ?? t.assignment ?? "") as string,
      dependencies: (t.dependencies ?? []) as string[],
      priority: (t.priority ?? 1) as number,
    };
  });
}

/**
 * Remove dependencies that reference tasks no longer in the list (filtered by role).
 * Appends a note to affected tasks instructing the agent to rely on knowledge base.
 */
function cleanupDependencies(tasks: SubTask[]): SubTask[] {
  const availableIds = new Set(tasks.map((t) => t.id));

  return tasks.map((task) => {
    if (task.dependencies.length === 0) return task;

    const dangling = task.dependencies.filter((depId) => !availableIds.has(depId));
    if (dangling.length === 0) return task;

    const kept = task.dependencies.filter((depId) => availableIds.has(depId));
    const note = `\n\n【角色过滤提示】以下前置任务不在你的角色范围内，已移除依赖：${dangling.join(", ")}。请直接基于知识库进行设计。`;

    return {
      ...task,
      dependencies: kept,
      description: task.description + note,
    };
  });
}

export class TaskPlanner {
  private promptTemplate: string;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  }

  async plan(requirement: string, role: string, skill: SkillPort | null): Promise<TaskPlan> {
    console.log(`[TaskPlanner] Using skill: ${skill?.getName() ?? "none"} for role=${role}`);
    const skillHint = skill ? `参考技能: ${skill.getName()}\n` : "";
    const prompt = this.promptTemplate
      .replace(/\{role\}/g, role)
      .replace(/\{skillHint\}/g, skillHint)
      .replace(/\{requirement\}/g, requirement);

    const response = await this.model.generate([
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", requirement),
    ]);

    try {
      const rawText = ChatMessage.textContent(response.message);
      const jsonStr = extractJson(rawText ?? "{}");
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      const rawTasks = (parsed.subTasks ?? parsed.sub_tasks ?? []) as unknown[];
      const allTasks = normalizeSubTasks(rawTasks);

      // Filter by role domain access
      const typedRole = role as Role;
      const filtered = allTasks.filter((t) => canAccessDomain(typedRole, t.domain));
      const cleaned = cleanupDependencies(filtered);

      return {
        planId: (parsed.planId as string) ?? "auto",
        requirement,
        subTasks: cleaned,
      };
    } catch (err) {
      console.error("[TaskPlanner] Failed to parse plan:", err, "Raw text:", ChatMessage.textContent(response.message));
      return {
        planId: "auto",
        requirement,
        subTasks: [],
      };
    }
  }
}
