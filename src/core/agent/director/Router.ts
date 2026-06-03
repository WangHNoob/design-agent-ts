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

function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return `[${braceMatch[0]}]`;
  return text;
}

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
      ChatMessage.text("user", "user", "请根据以上规则进行路由分配。"),
    ]);

    try {
      const rawText = ChatMessage.textContent(response.message);
      const jsonStr = extractJson(rawText ?? "[]");
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: Record<string, unknown>) => ({
        fragmentId: (item.fragmentId ?? item.taskId ?? item.id ?? "") as string,
        domain: ((item.domain as string) ?? "system_design").toLowerCase().replace(/-/g, "_"),
        agentName: (item.agentName ?? item.agent ?? "SystemDesigner") as string,
        assignment: (item.assignment ?? item.description ?? item.requirement ?? "") as string,
        priority: (item.priority ?? 1) as number,
      })) as RouteDecision[];
    } catch (err) {
      console.error("[Router] Failed to parse routing:", err, "Raw text:", ChatMessage.textContent(response.message));
      return [];
    }
  }
}
