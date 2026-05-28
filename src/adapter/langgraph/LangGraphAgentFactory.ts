import type { AgentFactory } from "../../port/agent/AgentFactory.js";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import { LangGraphAgentAdapter } from "./LangGraphAgentAdapter.js";
import { LangGraphModelAdapter } from "./LangGraphModelAdapter.js";
import { MemorySaver } from "@langchain/langgraph";

export class LangGraphAgentFactory implements AgentFactory {
  private agentCache = new Map<string, AgentPort>();
  private checkpointer: MemorySaver;

  constructor(
    private model: LangGraphModelAdapter,
    checkpointer?: MemorySaver
  ) {
    this.checkpointer = checkpointer ?? new MemorySaver();
  }

  createAgent(
    descriptor: AgentDescriptor,
    toolRegistry: ToolRegistry,
    memory: MemoryPort,
    hooks: AgentHook[]
  ): AgentPort {
    const cacheKey = descriptor.name;
    const cached = this.agentCache.get(cacheKey);
    if (cached) return cached;

    const tools = descriptor.toolNames
      .map((name) => toolRegistry.getTool(name))
      .filter((t): t is ToolPort => t !== undefined);

    const agent = new LangGraphAgentAdapter(
      descriptor,
      tools,
      this.model.getLangChainModel(),
      hooks,
      this.checkpointer
    );

    this.agentCache.set(cacheKey, agent);
    return agent;
  }
}
