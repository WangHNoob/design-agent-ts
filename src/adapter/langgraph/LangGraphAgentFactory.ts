import type { AgentFactory } from "../../port/agent/AgentFactory.js";
import type { AgentPort } from "../../port/agent/AgentPort.js";
import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { MemoryPort } from "../../port/memory/MemoryPort.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import { ContextManagementHook } from "../../core/hook/ContextManagementHook.js";
import { LangGraphAgentAdapter, type LangGraphSagaOptions } from "./LangGraphAgentAdapter.js";
import { LangGraphModelAdapter } from "./LangGraphModelAdapter.js";
import { MemorySaver } from "@langchain/langgraph";

export class LangGraphAgentFactory implements AgentFactory {
  private agentCache = new Map<string, AgentPort>();
  private checkpointer: MemorySaver;

  constructor(
    private model: LangGraphModelAdapter,
    checkpointer?: MemorySaver,
    private sagaOptions: LangGraphSagaOptions = { enabled: true },
  ) {
    this.checkpointer = checkpointer ?? new MemorySaver();
  }

  createAgent(
    descriptor: AgentDescriptor,
    toolRegistry: ToolRegistry,
    memory: MemoryPort,
    hooks: AgentHook[],
  ): AgentPort {
    const boundHooks = this.bindMemoryHooks(hooks, memory);

    // Session-scoped tools differ per call — never cache. 判据用 registry
    // 自述的 sessionScoped 标志而不是 instanceof：黑板开启时 session registry
    // 会被 CachingToolRegistry 包一层，instanceof 检查会被击穿，导致缓存
    // 实例带着上一个会话的 workspace/blackboard 工具跨会话复用（读错工作区）。
    if (toolRegistry.sessionScoped) {
      return this.buildAgent(descriptor, toolRegistry, boundHooks, memory);
    }

    const cacheKey = descriptor.name;
    const cached = this.agentCache.get(cacheKey);
    if (cached instanceof LangGraphAgentAdapter) {
      // Re-bind stateful short-term memory for this invocation.
      cached.setMemory(memory);
      cached.setHooks(boundHooks);
      return cached;
    }

    const agent = this.buildAgent(descriptor, toolRegistry, boundHooks, memory);
    this.agentCache.set(cacheKey, agent);
    return agent;
  }

  private bindMemoryHooks(hooks: AgentHook[], memory: MemoryPort): AgentHook[] {
    return hooks.map((hook) =>
      hook instanceof ContextManagementHook ? hook.withMemory(memory) : hook,
    );
  }

  private buildAgent(
    descriptor: AgentDescriptor,
    toolRegistry: ToolRegistry,
    hooks: AgentHook[],
    memory: MemoryPort,
  ): AgentPort {
    const tools = descriptor.toolNames
      .map((name) => toolRegistry.getTool(name))
      .filter((t): t is ToolPort => t !== undefined);

    return new LangGraphAgentAdapter(
      descriptor,
      tools,
      this.model,
      hooks,
      this.checkpointer,
      this.sagaOptions,
      memory,
    );
  }

  clearCache(): void {
    this.agentCache.clear();
  }
}
