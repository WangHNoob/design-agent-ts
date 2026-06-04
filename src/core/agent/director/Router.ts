import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { TaskPlan, Domain } from "../../schema/TaskPlan.js";
import type { RouteDecision } from "../../schema/RouteDecision.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { type Role, canAccessDomain } from "../../schema/Role.js";

// ---------------------------------------------------------------------------
// Deterministic domain → agent mapping (used when plan comes from a workflow)
// ---------------------------------------------------------------------------

const DOMAIN_TO_AGENT: Record<Domain, string> = {
  system_design: "SystemDesigner",
  combat_design: "CombatDesigner",
  numerical_planning: "NumericalPlanner",
  gameplay_design: "GameplayDesigner",
  executive_planning: "ExecutivePlanner",
  qa: "QAPlanner",
};

// ---------------------------------------------------------------------------
// LLM-based routing (fallback when no workflow)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class Router {
  private promptTemplate: string;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string,
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  }

  async route(plan: TaskPlan, role: string): Promise<RouteDecision[]> {
    if (plan.skillId) {
      // Workflow-defined routing: domain is already assigned by the workflow.
      return this.routeDeterministic(plan, role);
    }

    // No workflow: fall back to LLM-based routing.
    return this.routeWithLLM(plan, role);
  }

  // ---- Deterministic routing (workflow-based) ----

  private routeDeterministic(plan: TaskPlan, role: string): RouteDecision[] {
    const typedRole = role as Role;
    console.log(`[Router] Deterministic routing from workflow: ${plan.skillId}`);

    const decisions: RouteDecision[] = [];
    let priority = 1;

    for (const task of plan.subTasks) {
      if (!canAccessDomain(typedRole, task.domain)) continue;

      const agentName = DOMAIN_TO_AGENT[task.domain] ?? "SystemDesigner";
      decisions.push({
        fragmentId: task.fragmentId || task.id,
        domain: task.domain,
        agentName,
        assignment: task.description,
        priority: priority++,
      });
    }

    return decisions;
  }

  // ---- LLM-based routing (fallback) ----

  private async routeWithLLM(plan: TaskPlan, role: string): Promise<RouteDecision[]> {
    const prompt = this.promptTemplate.replace(
      /\{taskPlan\}/g,
      JSON.stringify(plan.subTasks, null, 2),
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

      const typedRole = role as Role;
      const decisions: RouteDecision[] = (parsed as Record<string, unknown>[])
        .map((item): RouteDecision => ({
          fragmentId: (item.fragmentId ?? item.taskId ?? item.id ?? "") as string,
          domain: (((item.domain as string) ?? "system_design").toLowerCase().replace(/-/g, "_")) as Domain,
          agentName: (item.agentName ?? item.agent ?? "SystemDesigner") as string,
          assignment: (item.assignment ?? item.description ?? item.requirement ?? "") as string,
          priority: (item.priority ?? 1) as number,
        }));
      return decisions.filter((d) => canAccessDomain(typedRole, d.domain));
    } catch (err) {
      console.error("[Router] Failed to parse routing:", err, "Raw text:", ChatMessage.textContent(response.message));
      return [];
    }
  }
}
