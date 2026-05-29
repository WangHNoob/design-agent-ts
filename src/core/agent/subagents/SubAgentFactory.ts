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
    systemPrompt: "你是系统策划专家。负责设计游戏的核心系统框架、功能模块和交互逻辑。",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  CombatDesigner: {
    name: "CombatDesigner",
    systemPrompt: "你是战斗策划专家。负责设计战斗机制、技能系统和平衡性。",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  NumericalPlanner: {
    name: "NumericalPlanner",
    systemPrompt: "你是数值策划专家。负责设计数值模型、成长曲线和经济系统。",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  GameplayDesigner: {
    name: "GameplayDesigner",
    systemPrompt: "你是玩法策划专家。负责设计核心玩法、关卡设计和用户体验。",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  ExecutivePlanner: {
    name: "ExecutivePlanner",
    systemPrompt: "你是执行策划专家。负责将设计方案转化为可执行的开发文档和配表需求。",
    maxIterations: 5,
    toolNames: DEFAULT_TOOL_NAMES,
    options: {},
  },
  QAPlanner: {
    name: "QAPlanner",
    systemPrompt: "你是QA专家。负责审查策划方案的完整性、一致性和可测试性。",
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
