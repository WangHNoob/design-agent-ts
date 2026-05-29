import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import type { RouteDecision } from "../../schema/RouteDecision.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { loadPrompt } from "../../tool/prompts/PromptLoader.js";

export class Router {
  private promptTemplate: string;

  constructor(private model: ChatModelPort) {
    this.promptTemplate = loadPrompt("router_classify");
  }

  async route(plan: TaskPlan, _role: string): Promise<RouteDecision[]> {
    const prompt = this.promptTemplate
      ? `${this.promptTemplate}\n\n任务计划:\n${JSON.stringify(plan.subTasks, null, 2)}\n\n可用 Agent: SystemDesigner, CombatDesigner, NumericalPlanner, GameplayDesigner, ExecutivePlanner, QAPlanner\n\n请为每个子任务返回路由决策（JSON数组）。`
      : `你是路由分发器。根据任务计划，为每个子任务分配最适合的 Agent。\n\n任务计划:\n${JSON.stringify(plan.subTasks, null, 2)}\n\n可用 Agent: SystemDesigner, CombatDesigner, NumericalPlanner, GameplayDesigner, ExecutivePlanner, QAPlanner\n\n输出格式（JSON数组）:\n[\n  { "fragmentId": "F1", "domain": "system_design", "agentName": "SystemDesigner", "assignment": "具体任务描述", "priority": 1 }\n]`;

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
