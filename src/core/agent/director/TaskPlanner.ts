import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";

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
      ChatMessage.text("user", "user", requirement),
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
