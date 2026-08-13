import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { ToolRegistry } from "../../../port/tool/ToolRegistry.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { SubTask, TaskPlan } from "../../schema/TaskPlan.js";
import { AGENT_NAME_TO_ROLE } from "./constants.js";
import { PlanHardGuard } from "../../plan/PlanHardGuard.js";
import { resolveExposedMcpTools, stripAndMergeMcpToolNames } from "../../structured/mcpExpose.js";
import { SessionToolRegistry } from "../../tool/SessionToolRegistry.js";
import { WorkspaceReadTool } from "../../tool/workspace/WorkspaceReadTool.js";
import { WorkspaceListTool } from "../../tool/workspace/WorkspaceListTool.js";
import { DelegatingTool } from "../../tool/DelegatingTool.js";
import { BlackboardTool } from "../../tool/BlackboardTool.js";
import { CachingToolRegistry } from "../../tool/CachingToolRegistry.js";
import { WhitelistToolRegistry } from "../../tool/ToolWhitelistWrapper.js";
import { AgentCallGuard, AgentInvokeTool, AGENT_INVOKE_TOOL_NAME, type CallContext, type HandoffLimits, type HandoffPayload, collectHandoffsForPrompt, distillHandoff, isHandoffViolationError, validateHandoff } from "../../multiagent/index.js";
import { SubAgentDescriptors } from "../subagents/SubAgentFactory.js";
import type { DirectorDeps, DirectorPlanHardConfig, DirectorMultiAgentConfig, DirectorStreamOptions } from "./DirectorAgent.js";
import type { DirectorContext } from "./DirectorContext.js";
import type { Router } from "./Router.js";

/**
 * ToolPlanResolver：为任务组装 Agent 描述符与工具注册表（plan-hard 白名单、
 * MCP on-demand 暴露、黑板/工作区工具、前驱 Handoff 注入、QueryAgent 组装）。
 *
 * 从 DirectorAgent 拆出（纯移动，行为不变）：所有可变状态（callGuard /
 * activeCallParent / handoffByTask）经 state 访问器注入，避免与主类循环依赖。
 */
export interface ToolPlanResolverCtx {
  deps: DirectorDeps;
  skillCtx: DirectorContext;
  logger: LoggerPort;
  config: {
    planHard(): DirectorPlanHardConfig;
    multiAgent(): DirectorMultiAgentConfig;
    handoffLimits(): HandoffLimits;
  };
  state: {
    getCallGuard(): AgentCallGuard;
    getActiveParent(): CallContext;
    getCallRoot(): CallContext;
    getHandoffByTask(): Map<string, HandoffPayload>;
  };
  runNestedAgentInvoke(input: {
    agentName: string;
    assignment: string;
    callParent: CallContext;
    sessionId: string;
    signal?: AbortSignal;
    options?: DirectorStreamOptions;
  }): Promise<string>;
  safeRecordPlanSpan(name: string, attributes: Record<string, unknown>): Promise<void>;
}

export class ToolPlanResolver {
  constructor(private readonly ctx: ToolPlanResolverCtx) {}

  resolveTaskAllowedTools(task: Pick<SubTask, "domain" | "allowedTools">): readonly string[] {
    return PlanHardGuard.resolveAllowedTools(task, {
      domainToolDefaults: this.ctx.config.planHard().domainToolDefaults,
    });
  }

  buildMergedExecutablePlan(
    plan: TaskPlan,
    assignments: TaskAssignment[],
    requirement: string,
  ): TaskPlan {
    return {
      planId: plan.planId,
      requirement,
      skillId: plan.skillId,
      subTasks: assignments.map((a) => {
        const originalSubTask = plan.subTasks.find(
          (st) => st.id === a.taskId || st.fragmentId === a.taskId,
        );
        // Preserve explicit allowedTools (including []); leave undefined for prepareTaskAgent
        const allowedTools = a.allowedTools !== undefined
          ? a.allowedTools
          : originalSubTask?.allowedTools;
        return {
          id: a.taskId,
          fragmentId: a.taskId,
          domain: a.domain,
          description: a.assignment,
          dependencies: originalSubTask?.dependencies ?? a.dependencies ?? [],
          priority: originalSubTask?.priority ?? 1,
          ...(allowedTools !== undefined ? { allowedTools: [...allowedTools] } : {}),
        };
      }),
    };
  }

  mapRoutingToAssignments(
    plan: TaskPlan,
    routing: Awaited<ReturnType<Router["route"]>>,
    options?: DirectorStreamOptions,
  ): TaskAssignment[] {
    return routing
      .map((decision): TaskAssignment | null => {
        const descriptor = this.ctx.skillCtx.getAgentDescriptor(decision.agentName, options);
        if (!descriptor) {
          this.ctx.logger.warn(`[DirectorAgent] Unknown agent: ${decision.agentName}`);
          return null;
        }
        const originalSubTask = plan.subTasks.find(
          (st) => st.id === decision.fragmentId || st.fragmentId === decision.fragmentId,
        );
        // Only pass through when the plan explicitly declared allowedTools (incl. [])
        const allowedTools = originalSubTask?.allowedTools;
        return {
          taskId: decision.fragmentId,
          domain: decision.domain,
          assignment: decision.assignment,
          agentDescriptor: descriptor,
          dependencies: originalSubTask?.dependencies ?? [],
          ...(allowedTools !== undefined ? { allowedTools: [...allowedTools] } : {}),
        };
      })
      .filter((a): a is TaskAssignment => a !== null);
  }

  prepareTaskAgent(
    task: TaskAssignment,
    sessionId: string,
    options?: DirectorStreamOptions,
  ): { descriptor: AgentDescriptor; toolRegistry: ToolRegistry } {
    const planHard = this.ctx.config.planHard();
    const multi = this.ctx.config.multiAgent();
    // Resolve here: undefined → domain defaults; [] → no external tools
    let allowedTools = [...this.resolveTaskAllowedTools({
      domain: task.domain,
      allowedTools: task.allowedTools,
    })];
    if (multi.enabled && multi.allowInvoke && !allowedTools.includes(AGENT_INVOKE_TOOL_NAME)) {
      allowedTools = [...allowedTools, AGENT_INVOKE_TOOL_NAME];
    }

    let descriptor = this.augmentDescriptorWithSkill(task.agentDescriptor, task.assignment, options);
    const mcpTools = this.resolveMcpToolsForTask(task, descriptor, options);
    const allMcpNames = this.ctx.deps.mcp?.toolNames ?? [];
    if (allMcpNames.length > 0) {
      // Always strip registered MCP from base descriptor first so defaultExposePrefixes
      // cannot leak past an explicit empty / narrow task whitelist.
      descriptor = {
        ...descriptor,
        toolNames: stripAndMergeMcpToolNames(descriptor.toolNames, allMcpNames, mcpTools),
      };
    }
    if (mcpTools.length > 0) {
      // Keep plan-hard whitelist in sync with concrete MCP names (patterns like kb_* expand here).
      // Never expand when task.allowedTools === [] (mcpTools is already empty in that case).
      allowedTools = Array.from(new Set([...allowedTools, ...mcpTools]));
    }
    if (multi.enabled && multi.allowInvoke) {
      descriptor = {
        ...descriptor,
        toolNames: Array.from(new Set([...descriptor.toolNames, AGENT_INVOKE_TOOL_NAME])),
      };
    }
    if (planHard.enabled) {
      descriptor = {
        ...descriptor,
        toolNames: PlanHardGuard.filterToolNames(descriptor.toolNames, allowedTools),
      };
    }

    let toolRegistry = this.buildSessionToolRegistry(sessionId, task.agentDescriptor.name, options);
    if (planHard.enabled) {
      toolRegistry = new WhitelistToolRegistry(toolRegistry, {
        taskId: task.taskId,
        allowedTools,
        rejectUnauthorized: planHard.rejectUnauthorizedTools,
        onDenied: (info) => this.ctx.safeRecordPlanSpan("plan.tool_denied", { ...info }),
      });
    }

    return { descriptor, toolRegistry };
  }

  /**
   * Resolve MCP tools for a task under mcp.exposeMode + task.allowedTools semantics:
   * - undefined → defaultExposePrefixes ∪ skill patterns
   * - [] → none
   * - non-empty → only patterns in allowedTools (no defaultExposePrefixes)
   */
  resolveMcpToolsForTask(
    task: TaskAssignment,
    descriptor: AgentDescriptor,
    options?: DirectorStreamOptions,
  ): string[] {
    const mcp = this.ctx.deps.mcp;
    if (!mcp || mcp.toolNames.length === 0) return [];

    const role = AGENT_NAME_TO_ROLE[descriptor.name];
    const skill = role
      ? this.ctx.skillCtx.skillRegistry(options).matchSkill(task.assignment, role)
      : null;
    const skillPatterns = task.allowedTools === undefined
      ? [
        ...(skill?.getMcpTools() ?? []),
        ...(skill ? (mcp.skillToolAllowlist[skill.getName()] ?? []) : []),
      ]
      : [];

    return resolveExposedMcpTools({
      allMcpToolNames: mcp.toolNames,
      exposeMode: mcp.exposeMode,
      defaultExposePrefixes: mcp.defaultExposePrefixes,
      skillPatterns,
      taskAllowedTools: task.allowedTools,
    });
  }

  /**
   * Match the best agent skill for a task's sub-agent and inject the full
   * skill content into the descriptor's systemPrompt.
   */
  augmentDescriptorWithSkill(
    descriptor: AgentDescriptor,
    assignment: string,
    options?: DirectorStreamOptions,
  ): AgentDescriptor {
    const role = AGENT_NAME_TO_ROLE[descriptor.name];
    if (!role) return descriptor;

    const skill = this.ctx.skillCtx.skillRegistry(options).matchSkill(assignment, role);
    if (!skill) return descriptor;

    const skillContent = skill.getContent();
    if (!skillContent) return descriptor;

    this.ctx.logger.info(`[DirectorAgent] Injecting skill "${skill.getName()}" (${skillContent.length} chars) into ${descriptor.name}`);
    return {
      ...descriptor,
      systemPrompt: `${descriptor.systemPrompt}\n\n---\n\n${skillContent}`,
    };
  }

  buildSessionToolRegistry(
    sessionId: string,
    agentType: string,
    options?: DirectorStreamOptions,
  ): ToolRegistry {
    const deps = this.ctx.deps;
    let registry: ToolRegistry = deps.toolRegistry;
    const wrap = deps.wrapTool ?? ((t) => t);
    const sessionTools: ToolPort[] = [];
    if (deps.workspace) {
      sessionTools.push(wrap(new WorkspaceReadTool(deps.workspace, sessionId)));
      sessionTools.push(wrap(new WorkspaceListTool(deps.workspace, sessionId)));
    }
    const multi = this.ctx.config.multiAgent();
    if (multi.enabled && multi.allowInvoke) {
      sessionTools.push(
        wrap(
          new AgentInvokeTool({
            guard: this.ctx.state.getCallGuard(),
            getParent: () => this.ctx.state.getActiveParent() ?? this.ctx.state.getCallRoot(),
            allowedAgentNames: Object.keys(SubAgentDescriptors),
            runNested: ({ agentName, assignment, callParent }) =>
              this.ctx.runNestedAgentInvoke({
                agentName,
                assignment,
                callParent,
                sessionId,
                signal: options?.signal,
                options,
              }),
            onGuardViolation: (err) =>
              this.ctx.safeRecordPlanSpan(`guard.${err.code}`, {
                agentName: err.agentName,
                path: err.path,
                depth: err.depth,
                maxDepth: err.maxDepth,
                reason: err.reason,
                via: AGENT_INVOKE_TOOL_NAME,
              }),
          }),
        ),
      );
    }
    if (sessionTools.length > 0) {
      registry = new SessionToolRegistry(registry, sessionTools);
    }
    return this.wrapWithBlackboard(registry, sessionId, agentType);
  }

  /**
   * 为指定会话叠加共享黑板能力：
   * 1) 注入 4 个 session-scoped 的 blackboard_* 工具（绑定该会话黑板）；
   * 2) 对白名单工具套上透明读穿缓存（{@link CachingToolRegistry}）。
   * 黑板禁用时原样返回 base，零侵入。
   */
  wrapWithBlackboard(base: ToolRegistry, sessionId: string, agentType: string): ToolRegistry {
    const deps = this.ctx.deps;
    const cfg = deps.blackboardConfig;
    if (!cfg?.enabled || !deps.blackboardStore) {
      return base;
    }
    const bb = deps.blackboardStore.getOrCreate(sessionId);

    // 1) session-scoped blackboard_* 工具
    const bbTool = new BlackboardTool(bb, agentType, cfg.defaultTtlSeconds);
    const wrap = deps.wrapTool ?? ((t) => t);
    const withBbTools = new SessionToolRegistry(base, [
      wrap(new DelegatingTool("blackboard_write", "向团队共享黑板写入一条关键要点。参数: key (string), value (string), ttl_seconds (number, optional)", bbTool, { action: "write" })),
      wrap(new DelegatingTool("blackboard_read", "按 key 读取黑板中的要点。参数: key (string)", bbTool, { action: "read" })),
      wrap(new DelegatingTool("blackboard_search", "按关键字检索黑板中的要点。参数: keyword (string)", bbTool, { action: "search" })),
      wrap(new DelegatingTool("blackboard_recent", "列出黑板中最近写入的要点。参数: limit (number, optional, default 5)", bbTool, { action: "recent" })),
    ]);

    // 2) 透明缓存：联网类工具用 webTtl，其余用 defaultTtl
    const cachedTools = new Set(cfg.cachedTools);
    const ttlOverrides = new Map<string, number>();
    for (const name of cfg.cachedTools) {
      if (name.startsWith("tavily") || name.startsWith("kb_")) {
        ttlOverrides.set(name, cfg.webTtlSeconds);
      }
    }
    return new CachingToolRegistry(withBbTools, bb, cachedTools, cfg.defaultTtlSeconds, ttlOverrides, agentType);
  }

  async injectPredecessorContext(task: TaskAssignment, sessionId: string): Promise<string> {
    const blackboardBlock = this.buildBlackboardContext(sessionId);

    if (!task.dependencies || task.dependencies.length === 0) {
      return blackboardBlock ? `${task.assignment}${blackboardBlock}` : task.assignment;
    }

    const multi = this.ctx.config.multiAgent();
    const limits = this.ctx.config.handoffLimits();
    const accepted: HandoffPayload[] = [];
    const handoffByTask = this.ctx.state.getHandoffByTask();

    for (const depId of task.dependencies) {
      let handoff = handoffByTask.get(depId);

      if (handoff) {
        try {
          validateHandoff(handoff, limits);
        } catch (err) {
          await this.ctx.safeRecordPlanSpan("guard.handoff_violation", {
            taskId: depId,
            reason: isHandoffViolationError(err) ? err.reason : String(err),
            field: isHandoffViolationError(err) ? err.field : undefined,
            source: "cache",
          });
          handoffByTask.delete(depId);
          handoff = undefined;
        }
      }

      // Prefer cached handoff; otherwise distill from workspace (never dump full text).
      if (!handoff && this.ctx.deps.workspace) {
        const content = await this.ctx.deps.workspace.readTaskOutput(sessionId, depId, "output.md");
        if (content) {
          const distilled = distillHandoff({
            taskId: depId,
            domain: "unknown",
            output: content,
            artifacts: ["output.md"],
            limits,
          });
          try {
            validateHandoff(distilled, limits);
            handoff = distilled;
            handoffByTask.set(depId, handoff);
          } catch (err) {
            await this.ctx.safeRecordPlanSpan("guard.handoff_violation", {
              taskId: depId,
              reason: isHandoffViolationError(err) ? err.reason : String(err),
              field: isHandoffViolationError(err) ? err.field : undefined,
              source: "workspace_distill",
            });
            handoff = undefined;
          }
        }
      }

      if (handoff) {
        accepted.push(handoff);
      }
    }

    if (accepted.length === 0) {
      return blackboardBlock ? `${task.assignment}${blackboardBlock}` : task.assignment;
    }

    const collected = collectHandoffsForPrompt(accepted, multi.handoffMaxTotalChars);
    if (collected.truncatedAtIndex !== undefined) {
      const skipped = accepted[collected.truncatedAtIndex];
      await this.ctx.safeRecordPlanSpan("guard.handoff_total_truncated", {
        taskId: task.taskId,
        skippedDepId: skipped?.taskId,
        totalChars: collected.totalChars,
        maxTotal: multi.handoffMaxTotalChars,
        truncatedAtIndex: collected.truncatedAtIndex,
      });
    }

    return `${task.assignment}${blackboardBlock}\n\n---\n## 前驱任务 Handoff（蒸馏结论）\n\n${collected.sections.join("\n\n")}\n\n> 如需完整内容，使用 workspace_read(task_id="<TASK_ID>", file_name="output.md")`;
  }

  /**
   * 构造注入子任务的近期黑板要点摘要块。无要点 / 黑板禁用时返回空串。
   * 每条仅取前 80 字，最多 recentInjectCount 条，避免膨胀 prompt。
   */
  buildBlackboardContext(sessionId: string): string {
    const deps = this.ctx.deps;
    const cfg = deps.blackboardConfig;
    if (!cfg?.enabled || !deps.blackboardStore) {
      return "";
    }
    const recent = deps.blackboardStore.getOrCreate(sessionId).listRecent(cfg.recentInjectCount);
    if (recent.length === 0) {
      return "";
    }
    const lines = recent.map((e) => {
      const preview = e.value.length > 80 ? e.value.slice(0, 80) + "…" : e.value;
      return `- [${e.agentType}] ${e.key}: ${preview}`;
    });
    return `\n\n---\n## 团队共享黑板（近期要点，避免重复搜索）\n\n${lines.join("\n")}\n\n> 可用 blackboard_read/blackboard_search 获取完整内容，或 blackboard_write 记录新要点。`;
  }

  async createQueryAgent(sessionId: string, querySystemPrompt?: string) {
    const deps = this.ctx.deps;
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: querySystemPrompt ?? this.ctx.skillCtx.getQuerySystemPrompt(),
      maxIterations: deps.limits?.queryAgentMaxIterations ?? 10,
      maxTokens: deps.limits?.queryMaxTokens,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
        ...this.blackboardToolNames(),
        ...this.resolveQueryMcpToolNames(),
      ],
      options: {},
      toolResultMaxChars: deps.limits?.toolResultMaxChars,
    };
    const memoryPort = await this.ctx.skillCtx.createMemoryPort();
    return deps.agentFactory.createAgent(
      queryDescriptor,
      this.wrapWithBlackboard(deps.toolRegistry, sessionId, "QueryAgent"),
      memoryPort,
      deps.hooks
    );
  }

  async createQueryAgentWithHooks(
    hooks: AgentHook[],
    sessionId: string,
    querySystemPrompt?: string,
  ) {
    const deps = this.ctx.deps;
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: querySystemPrompt ?? this.ctx.skillCtx.getQuerySystemPrompt(),
      maxIterations: deps.limits?.queryAgentMaxIterations ?? 10,
      maxTokens: deps.limits?.queryMaxTokens,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
        ...this.blackboardToolNames(),
        ...this.resolveQueryMcpToolNames(),
      ],
      options: {},
      toolResultMaxChars: deps.limits?.toolResultMaxChars,
    };
    const memoryPort = await this.ctx.skillCtx.createMemoryPort();
    return deps.agentFactory.createAgent(
      queryDescriptor,
      this.wrapWithBlackboard(deps.toolRegistry, sessionId, "QueryAgent"),
      memoryPort,
      hooks
    );
  }

  /** QueryAgent: knowledge-related MCP prefixes (defaultExposePrefixes) or all when exposeMode=all. */
  resolveQueryMcpToolNames(): string[] {
    const deps = this.ctx.deps;
    const mcp = deps.mcp;
    if (mcp && mcp.toolNames.length > 0) {
      return resolveExposedMcpTools({
        allMcpToolNames: mcp.toolNames,
        exposeMode: mcp.exposeMode,
        defaultExposePrefixes: mcp.defaultExposePrefixes,
      });
    }
    return deps.extraToolNames ?? [];
  }

  /** 黑板启用时返回 4 个 blackboard_* 工具名，供 Agent 描述符引用。 */
  blackboardToolNames(): string[] {
    const deps = this.ctx.deps;
    if (!deps.blackboardConfig?.enabled || !deps.blackboardStore) {
      return [];
    }
    return ["blackboard_write", "blackboard_read", "blackboard_search", "blackboard_recent"];
  }
}
