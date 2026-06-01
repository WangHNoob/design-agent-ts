import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";

export const DEFAULT_TOOL_NAMES = [
  "wiki_lookup",
  "wiki_read",
  "wiki_list",
  "grep_search",
  "kg_query_node",
  "kg_query_neighbors",
  "kg_list_nodes",
  "tavily_search",
  "tavily_extract",
];

const DEFAULT_DESCRIPTORS: Record<string, AgentDescriptor> = {
  SystemDesigner: {
    name: "SystemDesigner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  CombatDesigner: {
    name: "CombatDesigner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  NumericalPlanner: {
    name: "NumericalPlanner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  GameplayDesigner: {
    name: "GameplayDesigner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  ExecutivePlanner: {
    name: "ExecutivePlanner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  QAPlanner: {
    name: "QAPlanner",
    systemPrompt: "",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
};

export const SubAgentDescriptors: Record<string, AgentDescriptor> = { ...DEFAULT_DESCRIPTORS };

export function getSubAgentDescriptor(name: string): AgentDescriptor | undefined {
  return SubAgentDescriptors[name];
}

export function configureSubAgentDescriptors(
  prompts: Partial<Record<string, string>>,
  toolNames?: string[]
): void {
  for (const [name, systemPrompt] of Object.entries(prompts)) {
    const existing = SubAgentDescriptors[name];
    if (existing) {
      SubAgentDescriptors[name] = {
        ...existing,
        systemPrompt: systemPrompt || existing.systemPrompt,
        toolNames: toolNames ?? existing.toolNames,
      };
    }
  }
}

export function resetSubAgentDescriptors(): void {
  for (const [name, descriptor] of Object.entries(DEFAULT_DESCRIPTORS)) {
    SubAgentDescriptors[name] = { ...descriptor };
  }
}
