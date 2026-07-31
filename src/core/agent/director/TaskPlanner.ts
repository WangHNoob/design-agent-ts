import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan, SubTask, WorkflowTask, Domain } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { type Role, canAccessDomain } from "../../schema/Role.js";
import { generateStructured } from "../../structured/generateStructured.js";
import {
  TaskPlanSchema,
  RefinedRequirementsArraySchema,
} from "../../structured/schemas.js";

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
      ...(wt.allowedTools !== undefined ? { allowedTools: [...wt.allowedTools] } : {}),
    });
  }

  return cleanupDependencies(tasks);
}

function buildSingleTaskFallbackPlan(requirement: string, role: string): TaskPlan {
  const typedRole = role as Role;
  const preferredDomains: Domain[] = [
    "system_design",
    "combat_design",
    "gameplay_design",
    "numerical_planning",
    "executive_planning",
    "qa",
  ];
  const domain = preferredDomains.find((d) => canAccessDomain(typedRole, d)) ?? "system_design";

  return {
    planId: "auto-fallback",
    requirement,
    subTasks: [
      {
        id: "T1",
        fragmentId: "T1",
        domain,
        description: requirement,
        dependencies: [],
        priority: 1,
      },
    ],
    fallback: true,
    parseFallback: true,
  };
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
    const warnings: string[] = [];

    // Try LLM refinement; fall back to template substitution on failure.
    let refinedReqs: Map<string, string>;
    try {
      refinedReqs = await this.refineRequirements(workflowTasks, requirement);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn("[TaskPlanner] LLM refinement failed, using template substitution:", err);
      warnings.push(`任务细化 LLM 失败，已用模板降级：${detail}`);
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
      ...(warnings.length > 0 ? { warnings, fallback: true } : {}),
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

    const messages = [
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", "请根据以上规则为每个任务生成具体需求描述。"),
    ];

    const result = await generateStructured<import("../../structured/schemas.js").RefinedRequirementsParsed[]>(
      this.model,
      messages,
      RefinedRequirementsArraySchema,
      {
        preferArray: true,
        maxRetries: 2,
        onExhausted: "degrade",
        degradeValue: () =>
          workflowTasks.map((wt) => ({
            taskId: wt.taskId,
            refinedRequirement: wt.requirementTemplate.replace(/\{requirement\}/g, requirement),
          })),
      },
    );

    if (result.degraded) {
      const issues = result.issues?.join("; ") ?? "structured parse degraded";
      console.warn("[TaskPlanner] refineRequirements structured parse degraded:", issues);
      // Throw so planFromWorkflow records an auditable warning for the UI.
      throw new Error(`任务细化结构化输出降级：${issues}`);
    }

    const map = new Map<string, string>();
    for (const item of result.value) {
      map.set(item.taskId, item.refinedRequirement);
    }

    // Fill any missing tasks with template substitution.
    for (const wt of workflowTasks) {
      if (!map.has(wt.taskId)) {
        map.set(wt.taskId, wt.requirementTemplate.replace(/\{requirement\}/g, requirement));
      }
    }

    return map;
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

    const messages = [
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", requirement),
    ];

    const result = await generateStructured<import("../../structured/schemas.js").TaskPlanParsed>(
      this.model,
      messages,
      TaskPlanSchema,
      {
        maxRetries: 2,
        onExhausted: "degrade",
        degradeValue: () => ({
          planId: "auto-fallback",
          subTasks: [
            {
              id: "T1",
              fragmentId: "T1",
              domain: "system_design" as const,
              description: requirement,
              dependencies: [] as string[],
              priority: 1,
            },
          ],
        }),
      },
    );

    if (result.degraded) {
      const issues = result.issues?.join("; ") ?? "structured parse degraded";
      console.warn(
        "[TaskPlanner] planFromLLM structured parse degraded → single-task fallback:",
        issues,
      );
      return {
        ...buildSingleTaskFallbackPlan(requirement, role),
        warnings: [`LLM 任务规划解析失败，已降级为单任务：${issues}`],
      };
    }

    const typedRole = role as Role;
    const filtered = result.value.subTasks.filter((t) => canAccessDomain(typedRole, t.domain));
    const cleaned = cleanupDependencies(filtered);

    if (cleaned.length === 0) {
      console.warn(
        "[TaskPlanner] planFromLLM produced no role-accessible subTasks → single-task fallback",
      );
      return {
        ...buildSingleTaskFallbackPlan(requirement, role),
        warnings: ["LLM 规划结果无可访问子任务，已降级为单任务"],
      };
    }

    return {
      planId: result.value.planId,
      requirement,
      subTasks: cleaned,
    };
  }
}
