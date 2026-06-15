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
  "workspace_read",
  "workspace_list",
];

const DEFAULT_MAX_TOKENS = 16384;

const DEFAULT_DESCRIPTORS: Record<string, AgentDescriptor> = {
  SystemDesigner: {
    name: "SystemDesigner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  CombatDesigner: {
    name: "CombatDesigner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  NumericalPlanner: {
    name: "NumericalPlanner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  GameplayDesigner: {
    name: "GameplayDesigner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  ExecutivePlanner: {
    name: "ExecutivePlanner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  QAPlanner: {
    name: "QAPlanner",
    systemPrompt: "",
    maxIterations: 10,
    maxTokens: DEFAULT_MAX_TOKENS,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
};

export const SubAgentDescriptors: Record<string, AgentDescriptor> = { ...DEFAULT_DESCRIPTORS };

/**
 * Extra tool names (e.g. MCP-sourced tools) granted to every sub-agent.
 * Stored separately so they survive `resetSubAgentDescriptors()` during
 * hot-reload, which otherwise restores the static DEFAULT_TOOL_NAMES.
 */
let extraSubAgentToolNames: string[] = [];

/** Register extra tool names available to all sub-agents (persists across resets). */
export function setExtraSubAgentToolNames(names: string[]): void {
  extraSubAgentToolNames = [...names];
  // Apply immediately to current descriptors.
  for (const name of Object.keys(SubAgentDescriptors)) {
    const existing = SubAgentDescriptors[name];
    if (existing) {
      SubAgentDescriptors[name] = {
        ...existing,
        toolNames: mergeToolNames(existing.toolNames, extraSubAgentToolNames),
      };
    }
  }
}

function mergeToolNames(base: string[], extra: string[]): string[] {
  return Array.from(new Set([...base, ...extra]));
}

export function getSubAgentDescriptor(name: string): AgentDescriptor | undefined {
  return SubAgentDescriptors[name];
}

export function configureSubAgentDescriptors(
  prompts: Partial<Record<string, string>>,
  toolNames?: string[],
  defaultMaxIterations?: number,
  defaultMaxTokens?: number
): void {
  for (const [name, systemPrompt] of Object.entries(prompts)) {
    const existing = SubAgentDescriptors[name];
    if (existing) {
      const baseToolNames = toolNames ?? existing.toolNames;
      SubAgentDescriptors[name] = {
        ...existing,
        systemPrompt: systemPrompt || existing.systemPrompt,
        toolNames: mergeToolNames(baseToolNames, extraSubAgentToolNames),
        maxIterations: defaultMaxIterations ?? existing.maxIterations,
        maxTokens: defaultMaxTokens ?? existing.maxTokens,
      };
    }
  }
}

export function resetSubAgentDescriptors(): void {
  for (const [name, descriptor] of Object.entries(DEFAULT_DESCRIPTORS)) {
    SubAgentDescriptors[name] = {
      ...descriptor,
      toolNames: mergeToolNames(descriptor.toolNames, extraSubAgentToolNames),
    };
  }
}
