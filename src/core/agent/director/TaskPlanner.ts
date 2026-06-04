import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan, SubTask, WorkflowTask } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { type Role, canAccessDomain } from "../../schema/Role.js";

// ---------------------------------------------------------------------------
// LLM-based planning (fallback when no workflow matched)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LLM-based requirement refinement for workflow tasks
// ---------------------------------------------------------------------------

const REFINE_PROMPT_TEMPLATE = `你是一个游戏策划任务规划助手。下面有一个工作流定义了若干固定任务，每个任务有一个需求模板（包含 {requirement} 占位符）。

你的职责是：根据用户的原始需求，为每个任务生成具体的需求描述（替换 {requirement} 占位符）。

规则：
- 不要修改任务结构（taskId、domain、dependencies 等保持不变）
- 只需要填写每个任务的具体需求文本
- 需求应当具体、可操作，包含必要的上下文

用户原始需求：
{requirement}

任务列表：
{taskList}

请以 JSON 数组格式输出，每个元素包含 taskId 和 refinedRequirement：
[
  { "taskId": "TASK-001", "refinedRequirement": "具体的需求描述..." }
]`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

function extractJsonArray(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
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

/**
 * Convert WorkflowTask[] to SubTask[] using the given requirement map.
 * Tasks whose domain is not accessible by the role are filtered out.
 */
function workflowTasksToSubTasks(
  workflowTasks: readonly WorkflowTask[],
  refinedReqs: Map<string, string>,
  role: Role,
): SubTask[] {
  const tasks: SubTask[] = [];
  let priority = 1;

  for (const wt of workflowTasks) {
    if (!canAccessDomain(role, wt.domain)) continue;

    const description = refinedReqs.get(wt.taskId)
      ?? wt.requirementTemplate.replace(/\{requirement\}/g, "");

    tasks.push({
      id: wt.taskId,
      fragmentId: wt.taskId,
      domain: wt.domain,
      description,
      dependencies: [...wt.dependencies],
      priority: priority++,
    });
  }

  return cleanupDependencies(tasks);
}

// ---------------------------------------------------------------------------
// TaskPlanner
// ---------------------------------------------------------------------------

export class TaskPlanner {
  private promptTemplate: string;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string,
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  }

  async plan(requirement: string, role: string, skill: SkillPort | null): Promise<TaskPlan> {
    const workflowTasks = skill?.getWorkflowTasks() ?? [];

    if (workflowTasks.length > 0) {
      console.log(`[TaskPlanner] Using workflow: ${skill!.getName()} (${workflowTasks.length} tasks) for role=${role}`);
      return this.planFromWorkflow(workflowTasks, requirement, role, skill!.getName());
    }

    // No workflow matched — fall back to LLM-generated plan.
    console.log(`[TaskPlanner] No workflow matched, using LLM planning for role=${role}`);
    return this.planFromLLM(requirement, role, skill);
  }

  // ---- Workflow-based planning ----

  private async planFromWorkflow(
    workflowTasks: readonly WorkflowTask[],
    requirement: string,
    role: string,
    skillId: string,
  ): Promise<TaskPlan> {
    const typedRole = role as Role;

    // Try LLM refinement; fall back to template substitution on failure.
    let refinedReqs: Map<string, string>;
    try {
      refinedReqs = await this.refineRequirements(workflowTasks, requirement);
    } catch (err) {
      console.warn("[TaskPlanner] LLM refinement failed, using template substitution:", err);
      refinedReqs = new Map();
      for (const wt of workflowTasks) {
        refinedReqs.set(wt.taskId, wt.requirementTemplate.replace(/\{requirement\}/g, requirement));
      }
    }

    const subTasks = workflowTasksToSubTasks(workflowTasks, refinedReqs, typedRole);

    return {
      planId: `wf-${skillId}`,
      requirement,
      subTasks,
      skillId,
    };
  }

  /**
   * Use LLM to fill in the {requirement} placeholder in each task template
   * with a context-specific description.
   */
  private async refineRequirements(
    workflowTasks: readonly WorkflowTask[],
    requirement: string,
  ): Promise<Map<string, string>> {
    const taskList = workflowTasks
      .map((t) => `- ${t.taskId} (${t.domain}): ${t.requirementTemplate.split("\n")[0]}`)
      .join("\n");

    const prompt = REFINE_PROMPT_TEMPLATE
      .replace(/\{requirement\}/g, requirement)
      .replace(/\{taskList\}/g, taskList);

    const response = await this.model.generate([
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", "请根据以上规则为每个任务生成具体需求描述。"),
    ]);

    const rawText = ChatMessage.textContent(response.message) ?? "[]";
    const jsonStr = extractJsonArray(rawText);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>[];

    const result = new Map<string, string>();
    for (const item of parsed) {
      const taskId = (item.taskId ?? "") as string;
      const refined = (item.refinedRequirement ?? "") as string;
      if (taskId && refined) {
        result.set(taskId, refined);
      }
    }

    // Fill any missing tasks with template substitution.
    for (const wt of workflowTasks) {
      if (!result.has(wt.taskId)) {
        result.set(wt.taskId, wt.requirementTemplate.replace(/\{requirement\}/g, requirement));
      }
    }

    return result;
  }

  // ---- LLM-based planning (fallback) ----

  private async planFromLLM(
    requirement: string,
    role: string,
    skill: SkillPort | null,
  ): Promise<TaskPlan> {
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
