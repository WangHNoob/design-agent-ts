import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { SkillPort } from "../../../port/skill/SkillPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";

export class TaskPlanner {
  constructor(private model: ChatModelPort) {}

  async plan(requirement: string, role: string, skill: SkillPort | null): Promise<TaskPlan> {
    const skillHint = skill ? `参考技能: ${skill.getName()}\n` : "";
    const prompt = `你是任务规划器。将以下需求拆解为子任务列表（JSON格式）。
角色: ${role}
${skillHint}需求: ${requirement}

输出格式:
{
  "planId": "auto",
  "subTasks": [
    { "id": "T1", "fragmentId": "F1", "domain": "system_design", "description": "...", "dependencies": [], "priority": 1 }
  ]
}`;

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
    } catch {
      return {
        planId: "auto",
        requirement,
        subTasks: [],
      };
    }
  }
}
