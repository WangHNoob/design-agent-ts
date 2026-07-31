import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { SubTask, TaskPlan } from "../schema/TaskPlan.js";
import type { TaskResult } from "../schema/TaskResult.js";
import { PlanViolationError } from "./PlanViolationError.js";
import { generateStructured } from "../structured/generateStructured.js";
import { ReplanRemainingArraySchema } from "../structured/schemas.js";
import {
  isStructuredExhaustedError,
} from "../structured/StructuredParseError.js";

export interface PlanReplannerOptions {
  domainToolDefaults?: Readonly<Record<string, readonly string[]>>;
  promptTemplate?: string;
}

export interface ReplanInput {
  readonly originalPlan: TaskPlan;
  readonly completedResults: readonly TaskResult[];
  readonly failedTask: TaskResult;
}

const DEFAULT_REPLAN_PROMPT = `你是任务重规划助手（Replanner）。原计划部分步骤已成功，有一步失败。
请只输出 **剩余待执行** 的子任务 JSON 数组（不要包含已成功步骤）。

规则：
- 只输出 JSON 数组，不要 markdown
- 每个元素: id, fragmentId, domain, description, dependencies, priority, allowedTools(可选)
- dependencies 只能引用：已成功任务 id，或本次数组内更早的任务 id
- 不要引入环依赖
- domain 必须是: system_design | combat_design | numerical_planning | gameplay_design | executive_planning | qa

用户需求: {requirement}
已成功任务: {completed}
失败任务: {failed}
原剩余/失败相关上下文: {context}

输出示例:
[
  { "id": "T3", "fragmentId": "T3", "domain": "combat_design", "description": "...", "dependencies": ["T1"], "priority": 1 }
]`;

/**
 * Validate remaining tasks: no unknown deps (except completed ids), no cycles among remaining.
 */
export function validateRemainingTasks(
  remaining: readonly SubTask[],
  completedIds: ReadonlySet<string>,
): void {
  const remainingIds = new Set(remaining.map((t) => t.id));
  for (const task of remaining) {
    if (remainingIds.has(task.id) === false) continue;
    for (const dep of task.dependencies) {
      if (!completedIds.has(dep) && !remainingIds.has(dep)) {
        throw new PlanViolationError({
          taskId: task.id,
          code: "invalid_plan",
          reason: `replan dependency "${dep}" is neither completed nor in remaining tasks`,
        });
      }
    }
  }

  // Kahn cycle check on remaining subgraph (completed deps treated as satisfied)
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const t of remaining) {
    indegree.set(t.id, 0);
    adj.set(t.id, []);
  }
  for (const t of remaining) {
    for (const dep of t.dependencies) {
      if (!remainingIds.has(dep)) continue;
      adj.get(dep)!.push(t.id);
      indegree.set(t.id, (indegree.get(t.id) ?? 0) + 1);
    }
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const next of adj.get(id) ?? []) {
      const nextDeg = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }
  if (visited !== remaining.length) {
    throw new PlanViolationError({
      taskId: remaining[0]?.id ?? "replan",
      code: "invalid_plan",
      reason: "replan remaining tasks contain a dependency cycle",
    });
  }
}

/**
 * LLM Replanner: produce a replacement fragment of **remaining** SubTasks after a failure.
 */
export class PlanReplanner {
  private readonly promptTemplate: string;

  constructor(
    private readonly model: ChatModelPort,
    private readonly options: PlanReplannerOptions = {},
  ) {
    this.promptTemplate = options.promptTemplate ?? DEFAULT_REPLAN_PROMPT;
  }

  async replanRemaining(input: ReplanInput): Promise<SubTask[]> {
    const completed = input.completedResults.filter((r) => r.status === "success");
    const completedIds = new Set(completed.map((r) => r.taskId));
    const completedSummary = completed
      .map((r) => `- ${r.taskId} (${r.domain}): ok`)
      .join("\n") || "(none)";
    const failedSummary = `${input.failedTask.taskId} (${input.failedTask.domain}): ${input.failedTask.errorMessage ?? "error"}`;
    const unfinished = input.originalPlan.subTasks.filter((t) => !completedIds.has(t.id));
    const context = unfinished
      .map((t) => `- ${t.id} deps=[${t.dependencies.join(",")}] ${t.description.slice(0, 120)}`)
      .join("\n");

    const prompt = this.promptTemplate
      .replace(/\{requirement\}/g, input.originalPlan.requirement)
      .replace(/\{completed\}/g, completedSummary)
      .replace(/\{failed\}/g, failedSummary)
      .replace(/\{context\}/g, context);

    const messages = [
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", "请输出剩余子任务 JSON 数组。"),
    ];

    let remaining: SubTask[];
    try {
      const result = await generateStructured<import("../structured/schemas.js").ReplanRemainingParsed[]>(
        this.model,
        messages,
        ReplanRemainingArraySchema,
        {
          preferArray: true,
          maxRetries: 2,
          onExhausted: "throw",
        },
      );
      remaining = result.value.map((t) => ({
        id: t.id,
        fragmentId: t.fragmentId,
        domain: t.domain,
        description: t.description,
        dependencies: t.dependencies,
        priority: t.priority,
        ...(t.allowedTools !== undefined ? { allowedTools: t.allowedTools } : {}),
      }));
    } catch (err) {
      const reason = isStructuredExhaustedError(err)
        ? `replan structured parse exhausted: ${err.issues.join("; ")}`
        : `replan JSON parse failed: ${err instanceof Error ? err.message : String(err)}`;
      throw new PlanViolationError({
        taskId: input.failedTask.taskId,
        code: "invalid_plan",
        reason,
      });
    }

    // Drop any tasks that collide with already-completed ids
    const filtered = remaining.filter((t) => !completedIds.has(t.id));
    validateRemainingTasks(filtered, completedIds);
    return filtered;
  }
}
