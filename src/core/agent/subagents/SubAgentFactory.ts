import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";

export const SubAgentDescriptors: Record<string, AgentDescriptor> = {
  SystemDesigner: {
    name: "SystemDesigner",
    systemPrompt: "你是系统策划专家。负责设计游戏的核心系统框架、功能模块和交互逻辑。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
  CombatDesigner: {
    name: "CombatDesigner",
    systemPrompt: "你是战斗策划专家。负责设计战斗机制、技能系统和平衡性。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
  NumericalPlanner: {
    name: "NumericalPlanner",
    systemPrompt: "你是数值策划专家。负责设计数值模型、成长曲线和经济系统。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
  GameplayDesigner: {
    name: "GameplayDesigner",
    systemPrompt: "你是玩法策划专家。负责设计核心玩法、关卡设计和用户体验。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
  ExecutivePlanner: {
    name: "ExecutivePlanner",
    systemPrompt: "你是执行策划专家。负责将设计方案转化为可执行的开发文档和配表需求。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
  QAPlanner: {
    name: "QAPlanner",
    systemPrompt: "你是QA专家。负责审查策划方案的完整性、一致性和可测试性。",
    maxIterations: 5,
    toolNames: ["wiki_read", "kg_query", "grep_search"],
    options: {},
  },
};

export function getSubAgentDescriptor(name: string): AgentDescriptor | undefined {
  return SubAgentDescriptors[name];
}
