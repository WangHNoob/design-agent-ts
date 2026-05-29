import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import { loadPrompt } from "../../tool/prompts/PromptLoader.js";

function buildDescriptor(name: string, promptFile: string, extraTools: string[] = []): AgentDescriptor {
  const systemPrompt = loadPrompt(promptFile);
  return {
    name,
    systemPrompt: systemPrompt || `你是${name}专家。`,
    maxIterations: 5,
    toolNames: [
      "wiki_lookup",
      "wiki_read",
      "wiki_list",
      "grep_search",
      "kg_query_node",
      "kg_query_neighbors",
      "kg_list_nodes",
      "tavily_search",
      "tavily_extract",
      ...extraTools,
    ],
    options: {},
  };
}

export const SubAgentDescriptors: Record<string, AgentDescriptor> = {
  SystemDesigner: buildDescriptor("SystemDesigner", "system_designer"),
  CombatDesigner: buildDescriptor("CombatDesigner", "combat_designer"),
  NumericalPlanner: buildDescriptor("NumericalPlanner", "numerical_planner"),
  GameplayDesigner: buildDescriptor("GameplayDesigner", "gameplay_designer"),
  ExecutivePlanner: buildDescriptor("ExecutivePlanner", "executive_planner"),
  QAPlanner: buildDescriptor("QAPlanner", "qa_planner"),
};

export function getSubAgentDescriptor(name: string): AgentDescriptor | undefined {
  return SubAgentDescriptors[name];
}
