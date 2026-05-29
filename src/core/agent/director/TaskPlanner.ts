import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";

const DEFAULT_PROMPT_TEMPLATE = `你是任务规划器。将以下需求拆解为子任务列表（JSON格式）。

角色: {role}
{skillHint}需求: {requirement}

输出格式:
{
  "planId": "auto",
  "subTasks": [
    { "id": "T1", "fragmentId": "F1", "domain": "system_design", "description": "...", "dependencies": [], "priority": 1 }
  ]
}`;

export class TaskPlanner {
  private promptTemplate: string;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  }

  async plan(requirement: string, role: string, skill: SkillPort | null): Promise<TaskPlan> {
    const skillHint = skill ? `参考技能: ${skill.getName()}\n` : "";
    const prompt = this.promptTemplate
      .replace(/\{role\}/g, role)
      .replace(/\{skillHint\}/g, skillHint)
      .replace(/\{requirement\}/g, requirement);

    const response = await this.model.generate([
      ChatMessage.text("system", "system", prompt),
    ]);

    try {
      const text = ChatMessage.textContent(response.message);
      const parsed = JSON.parse(text ?? "{}") as TaskPlan;
      return {
        planId: parsed.planId ?? "auto",
        requirement,
        subTasks: parsed.subTasks ?? [],
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
