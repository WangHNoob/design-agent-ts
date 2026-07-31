/** Maps sub-agent descriptor names to prompt artifact names. */
export const SUB_AGENT_PROMPT_NAMES: Record<string, string> = {
  SystemDesigner: "system_designer",
  CombatDesigner: "combat_designer",
  NumericalPlanner: "numerical_planner",
  GameplayDesigner: "gameplay_designer",
  ExecutivePlanner: "executive_planner",
  QAPlanner: "qa_planner",
};

export const DIRECTOR_PROMPT_NAMES = {
  querySystem: "query_knowledge",
  taskPlanner: "task_planner_freeform",
  router: "router_classify",
} as const;

export function promptNameToAgentName(promptName: string): string | undefined {
  for (const [agent, name] of Object.entries(SUB_AGENT_PROMPT_NAMES)) {
    if (name === promptName) return agent;
  }
  return undefined;
}
