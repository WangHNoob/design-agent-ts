import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { TaskPlan, Domain } from "../../schema/TaskPlan.js";
import type { RouteDecision } from "../../schema/RouteDecision.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { type Role, canAccessDomain } from "../../schema/Role.js";
import { generateStructured } from "../../structured/generateStructured.js";
import { RouteDecisionArraySchema } from "../../structured/schemas.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../../observability/ConsoleLogger.js";

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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class Router {
  private promptTemplate: string;

  private readonly logger: LoggerPort;

  constructor(
    private model: ChatModelPort,
    promptTemplate?: string,
    logger?: LoggerPort,
  ) {
    this.promptTemplate = promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
    this.logger = logger ?? new ConsoleLogger();
  }

  async route(plan: TaskPlan, role: string): Promise<RouteDecision[]> {
    if (plan.skillId) {
      // Workflow-defined routing: domain is already assigned by the workflow.
      return this.routeDeterministic(plan, role);
    }

    // No workflow: fall back to LLM-based routing.
    return this.routeWithLLM(plan, role);
  }

  // ---- Deterministic routing (workflow-based / structured degrade) ----

  private routeDeterministic(plan: TaskPlan, role: string): RouteDecision[] {
    const typedRole = role as Role;
    this.logger.info(`[Router] Deterministic routing${plan.skillId ? ` from workflow: ${plan.skillId}` : " (domain→agent)"}`);

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

    const messages = [
      ChatMessage.text("system", "system", prompt),
      ChatMessage.text("user", "user", "请根据以上规则进行路由分配。"),
    ];

    const result = await generateStructured<import("../../structured/schemas.js").RouteDecisionParsed[]>(
      this.model,
      messages,
      RouteDecisionArraySchema,
      {
        preferArray: true,
        maxRetries: 2,
        onExhausted: "degrade",
        degradeValue: () => [],
      },
    );

    if (result.degraded) {
      this.logger.warn(
        `[Router] structured parse exhausted → deterministic domain→agent degrade: ${result.issues?.join("; ")}`,
      );
      return this.routeDeterministic(plan, role);
    }

    const typedRole = role as Role;
    const decisions: RouteDecision[] = result.value.map((item) => ({
      fragmentId: item.fragmentId,
      domain: item.domain,
      agentName: item.agentName,
      assignment: item.assignment,
      priority: item.priority,
    }));
    const filtered = decisions.filter((d) => canAccessDomain(typedRole, d.domain));
    if (filtered.length === 0) {
      this.logger.warn("[Router] LLM routing empty after role filter → deterministic degrade");
      return this.routeDeterministic(plan, role);
    }
    return filtered;
  }
}
