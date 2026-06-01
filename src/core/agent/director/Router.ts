import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import type { RouteDecision } from "../../schema/RouteDecision.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";

const DEFAULT_PROMPT_TEMPLATE = `Route each sub-task to the most suitable agent.

Task plan:
{taskPlan}

Available agents: SystemDesigner, CombatDesigner, NumericalPlanner, GameplayDesigner, ExecutivePlanner, QAPlanner

Output format (JSON array):
[
  { "fragmentId": "F1", "domain": "system_design", "agentName": "SystemDesigner", "assignment": "...", "priority": 1 }
]`;

export class Router {
  private promptTemplate: string;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  }

  async route(plan: TaskPlan, _role: string): Promise<RouteDecision[]> {
    const prompt = this.promptTemplate.replace(
      /\{taskPlan\}/g,
      JSON.stringify(plan.subTasks, null, 2)
    );

    const response = await this.model.generate([
      ChatMessage.text("system", "system", prompt),
    ]);

    try {
      const text = ChatMessage.textContent(response.message);
      const parsed = JSON.parse(text ?? "[]");
      return Array.isArray(parsed) ? (parsed as RouteDecision[]) : [];
    } catch (err) {
      console.error("[Router] Failed to parse routing:", err, "Raw text:", ChatMessage.textContent(response.message));
      return [];
    }
  }
}
