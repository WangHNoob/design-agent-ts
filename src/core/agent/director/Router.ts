import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import type { RouteDecision } from "../../schema/RouteDecision.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";

export class Router {
  constructor(private model: ChatModelPort) {}

  async route(plan: TaskPlan, _role: string): Promise<RouteDecision[]> {
    const prompt = `你是路由分发器。根据任务计划，为每个子任务分配最适合的 Agent。

任务计划:
${JSON.stringify(plan.subTasks, null, 2)}

可用 Agent: SystemDesigner, CombatDesigner, NumericalPlanner, GameplayDesigner, ExecutivePlanner, QAPlanner

输出格式（JSON数组）:
[
  { "fragmentId": "F1", "domain": "system_design", "agentName": "SystemDesigner", "assignment": "具体任务描述", "priority": 1 }
]`;

    const response = await this.model.generate([
      ChatMessage.text("system", "system", prompt),
    ]);

    try {
      const text = ChatMessage.textContent(response.message);
      const parsed = JSON.parse(text ?? "[]");
      return Array.isArray(parsed) ? (parsed as RouteDecision[]) : [];
    } catch {
      return [];
    }
  }
}
