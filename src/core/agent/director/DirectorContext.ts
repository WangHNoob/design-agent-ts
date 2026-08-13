import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import type { SkillRegistry } from "../../../port/skill/SkillRegistry.js";
import { getSubAgentDescriptor } from "../subagents/SubAgentFactory.js";
import type { DirectorDeps, DirectorStreamOptions } from "./DirectorAgent.js";
import { TaskPlanner } from "./TaskPlanner.js";
import { Router } from "./Router.js";

/**
 * Director 的上下文访问器：从 executionOverrides 优先解析 skill registry、
 * planner、router、query 提示词、子 Agent 描述符，并创建短时记忆端口。
 *
 * 从 DirectorAgent 拆出（纯移动，行为不变）：DirectorAgent 只保留编排，
 * 这里负责"当前会话上下文"的解析，便于独立测试。
 */
export class DirectorContext {
  private readonly taskPlanner: TaskPlanner;
  private readonly router: Router;
  private readonly querySystemPrompt: string;

  constructor(
    private readonly deps: DirectorDeps,
    private readonly logger: LoggerPort,
  ) {
    this.taskPlanner = new TaskPlanner(deps.model, deps.prompts?.taskPlanner, logger);
    this.router = new Router(deps.model, deps.prompts?.router, logger);
    this.querySystemPrompt = deps.prompts?.querySystem ?? "";
  }

  skillRegistry(options?: DirectorStreamOptions): SkillRegistry {
    return options?.executionOverrides?.skillRegistry ?? this.deps.skillRegistry;
  }

  getTaskPlanner(options?: DirectorStreamOptions): TaskPlanner {
    return options?.executionOverrides?.taskPlanner ?? this.taskPlanner;
  }

  getRouter(options?: DirectorStreamOptions): Router {
    return options?.executionOverrides?.router ?? this.router;
  }

  getQuerySystemPrompt(options?: DirectorStreamOptions): string {
    return options?.executionOverrides?.querySystemPrompt ?? this.querySystemPrompt;
  }

  /** Query/design short-term memory: sliding-window + archive by default. */
  async createMemoryPort() {
    const mem = this.deps.memory;
    if (mem?.archiveEnabled === false) {
      const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
      return new InMemoryMemoryPort();
    }
    const { SlidingWindowMemoryPort } = await import("../../memory/SlidingWindowMemoryPort.js");
    return new SlidingWindowMemoryPort({
      archiveEnabled: true,
      protectRecentTurns: mem?.protectRecentTurns ?? 10,
      maxActiveMessages: mem?.maxActiveMessages ?? 40,
      maxTokens: mem?.maxTokens ?? 128_000,
      compressionThreshold: mem?.compressionThreshold ?? 0.7,
    });
  }

  getAgentDescriptor(
    agentName: string,
    options?: DirectorStreamOptions,
  ): AgentDescriptor | undefined {
    const override = options?.executionOverrides?.subAgentPrompts?.[agentName];
    const base = getSubAgentDescriptor(agentName);
    if (!base) return undefined;
    if (override) return { ...base, systemPrompt: override };
    return base;
  }
}
