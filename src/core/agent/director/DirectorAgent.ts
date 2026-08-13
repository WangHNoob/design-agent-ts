import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../port/agent/AgentFactory.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../../observability/ConsoleLogger.js";
import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { ToolRegistry } from "../../../port/tool/ToolRegistry.js";
import type { SkillRegistry } from "../../../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "./HumanReviewGateway.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import type { IdGeneratorPort } from "../../../port/infra/IdGeneratorPort.js";
import type { TracerPort } from "../../../port/tracing/TracerPort.js";
import type { WorkspaceManager } from "../../workspace/WorkspaceManager.js";
import { Integrator } from "./Integrator.js";
import { DirectorContext } from "./DirectorContext.js";
import { ToolPlanResolver } from "./ToolPlanResolver.js";
import { PlanExecutor } from "./PlanExecutor.js";
import { clearTraceTokenBudget } from "./traceBudget.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import type { SummarizerPort } from "../../../port/memory/SummarizerPort.js";
import type { BlackboardStorePort } from "../../../port/blackboard/BlackboardPort.js";
import type { ExecutionOverrides } from "../../versioning/buildExecutionOverrides.js";
import { AgentCallGuard, type CallContext, type HandoffLimits, type HandoffPayload } from "../../multiagent/index.js";
import type { FaqMatchRaw } from "../../faq/types.js";


export interface StreamEvent {
  type: "start" | "plan" | "route" | "task_start" | "task_complete" | "integrate" | "chunk" | "complete" | "error" | "cancelled"
    | "thinking" | "tool_start" | "tool_complete" | "knowledge_used" | "skill_matched" | "hitl" | "replan" | "faq_hit";
  data: Record<string, unknown>;
}

export interface DirectorStreamOptions {
  /** AbortSignal to cancel the execution. When aborted, all LLM calls stop and the stream ends gracefully. */
  signal?: AbortSignal;
  taskTimeoutMs?: number;
  resumePlan?: TaskPlan;
  initialTaskResults?: readonly TaskResult[];
  /** Durable HITL requires the owning execution id for pause/resume. */
  executionId?: string;
  /** Tenant user id for Trace persistence (Worker/ALS usually supplies via resolveUserId). */
  userId?: string;
  /** MVCC execution overrides built from session version snapshot. */
  executionOverrides?: ExecutionOverrides;
  /**
   * Parent CallContext for nested Agent-as-Tool invocations.
   * When omitted, Director uses the design-run root (Director depth=0).
   */
  callParent?: CallContext;
}

export interface KnowledgeSource {
  type: 'kb_component' | 'wiki_page' | 'kg_node' | 'grep_match' | 'web_result';
  id: string;
  title?: string;
  relevance?: string;
  trust?: {
    score: number;
    status: 'trusted' | 'usable_with_risk' | 'needs_review' | 'blocked';
    breakdown?: {
      evidence?: number;
      completeness?: number;
      auditFreshness?: number;
      consistency?: number;
    };
  };
  evidence?: {
    count: number;
    evidenceIds?: string[];
    hasEvidence: boolean;
  };
  release?: {
    releaseId: string;
    version: string;
    publishedAt: string;
  };
  qualityFlags?: string[];
  componentKind?: string;
  artifactId?: string;
}

export interface DirectorPrompts {
  querySystem?: string;
  taskPlanner?: string;
  router?: string;
}

/** Plan hard-guard knobs injected from FrameworkConfig.guards (composition root). */
export interface DirectorPlanHardConfig {
  enabled: boolean;
  maxReplans: number;
  rejectUnauthorizedTools: boolean;
  domainToolDefaults: Record<string, string[]>;
}

/** Multi-agent runaway / handoff knobs from FrameworkConfig.guards. */
export interface DirectorMultiAgentConfig {
  enabled: boolean;
  maxFanOut: number;
  maxDepth: number;
  detectCycles: boolean;
  handoffMaxChars: number;
  handoffMaxKeyPoints: number;
  handoffMaxTotalChars: number;
  allowInvoke: boolean;
}

export interface DirectorDeps {
  model: ChatModelPort;
  agentFactory: AgentFactory;
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  humanReviewGateway: HumanReviewGateway;
  hooks: AgentHook[];
  prompts?: DirectorPrompts;
  idGenerator?: IdGeneratorPort;
  workspace?: WorkspaceManager;
  limits?: {
    queryAgentMaxIterations?: number;
    queryMaxTokens?: number;
    subAgentMaxIterations?: number;
    grepSearchResultLimit?: number;
    webSourceResultLimit?: number;
    /** SSE progress-event drain poll interval (ms). Default 200. */
    eventDrainIntervalMs?: number;
    /** Grace period to collect partial output from an aborted in-flight task (ms). Default 2000. */
    inFlightPartialOutputTimeoutMs?: number;
    /** 单条工具结果进入模型上下文的最大字符数（0=不截断）。 */
    toolResultMaxChars?: number;
  };
  /** Short-term sliding-window memory (query path required). */
  memory?: {
    archiveEnabled?: boolean;
    protectRecentTurns?: number;
    maxActiveMessages?: number;
    maxTokens?: number;
    compressionThreshold?: number;
    /** 归档摘要器：缺省启发式；注入 LLMSummarizerAdapter 启用 LLM 摘要（01-P3） */
    summarizer?: SummarizerPort;
  };
  /** Extra tool names (e.g. MCP-sourced tools) appended to the query agent's toolset. */
  extraToolNames?: string[];
  /**
   * MCP on-demand exposure knobs (composition root).
   * When omitted, MCP tools are only those already in descriptor.toolNames / extraToolNames.
   */
  mcp?: {
    exposeMode: "all" | "on_demand";
    defaultExposePrefixes: string[];
    skillToolAllowlist: Record<string, string[]>;
    /** All registered MCP tool names (registry already holds the ToolPort instances). */
    toolNames: string[];
  };
  /** 会话级共享黑板仓库（缺省时禁用黑板）。 */
  blackboardStore?: BlackboardStorePort;
  /** 黑板行为配置（缺省或 enabled=false 时退回无缓存行为）。 */
  blackboardConfig?: {
    enabled: boolean;
    defaultTtlSeconds: number;
    webTtlSeconds: number;
    recentInjectCount: number;
    cachedTools: string[];
  };
  /** Optional tracer; when set, each execute/stream opens a root Trace. */
  tracer?: TracerPort;
  /** Resolve tenant userId when options.userId is omitted (e.g. from ALS). */
  resolveUserId?: () => string | undefined;
  /** Optional security wrapper for session-scoped tools. */
  wrapTool?: (tool: ToolPort) => ToolPort;
  /** Structured logger (defaults to ConsoleLogger). */
  logger?: LoggerPort;
  /** Plan hard guards (step tools / replan budget). Defaults: enabled. */
  planHard?: DirectorPlanHardConfig;
  /** Multi-agent runaway guards + handoff. Defaults: enabled. */
  multiAgent?: DirectorMultiAgentConfig;
  /** When false, query path suppresses token-level SSE chunks. Default true. */
  streamingEnabled?: boolean;
  faqFastPath?: {
    enabled: boolean;
    threshold: number;
    match: (query: string) => Promise<FaqMatchRaw | null>;
  };
}

export class DirectorAgent {
  private skillCtx: DirectorContext;
  private planResolver: ToolPlanResolver;
  private executor: PlanExecutor;
  private callGuard: AgentCallGuard;
  private callRoot: CallContext;
  private activeCallParent: CallContext;
  private readonly handoffByTask = new Map<string, HandoffPayload>();

  private readonly logger: LoggerPort;

  constructor(private deps: DirectorDeps) {
    this.logger = deps.logger ?? new ConsoleLogger();
    this.skillCtx = new DirectorContext(deps, this.logger);
    const multi = this.multiAgentConfig();
    this.callGuard = new AgentCallGuard({
      maxDepth: multi.maxDepth,
      detectCycles: multi.detectCycles,
    });
    this.callRoot = this.callGuard.root("Director");
    this.activeCallParent = this.callRoot;
    this.planResolver = new ToolPlanResolver({
      deps,
      skillCtx: this.skillCtx,
      logger: this.logger,
      config: {
        planHard: () => this.planHardConfig(),
        multiAgent: () => this.multiAgentConfig(),
        handoffLimits: () => this.handoffLimits(),
      },
      state: {
        getCallGuard: () => this.callGuard,
        getActiveParent: () => this.activeCallParent,
        getCallRoot: () => this.callRoot,
        getHandoffByTask: () => this.handoffByTask,
      },
      runNestedAgentInvoke: (input) => this.executor.runNestedAgentInvoke(input),
      safeRecordPlanSpan: (name, attributes) => this.executor.safeRecordPlanSpan(name, attributes),
    });
    this.executor = new PlanExecutor({
      deps,
      skillCtx: this.skillCtx,
      planResolver: this.planResolver,
      integrator: new Integrator(),
      logger: this.logger,
      config: {
        planHard: () => this.planHardConfig(),
        multiAgent: () => this.multiAgentConfig(),
        handoffLimits: () => this.handoffLimits(),
      },
      state: {
        getCallGuard: () => this.callGuard,
        setCallGuard: (guard) => { this.callGuard = guard; },
        getActiveParent: () => this.activeCallParent,
        setActiveParent: (ctx) => { this.activeCallParent = ctx; },
        getCallRoot: () => this.callRoot,
        setCallRoot: (ctx) => { this.callRoot = ctx; },
        getHandoffByTask: () => this.handoffByTask,
      },
    });
  }

  private planHardConfig(): DirectorPlanHardConfig {
    return {
      enabled: this.deps.planHard?.enabled !== false,
      maxReplans: this.deps.planHard?.maxReplans ?? 2,
      rejectUnauthorizedTools: this.deps.planHard?.rejectUnauthorizedTools !== false,
      domainToolDefaults: this.deps.planHard?.domainToolDefaults ?? {},
    };
  }

  private multiAgentConfig(): DirectorMultiAgentConfig {
    return {
      enabled: this.deps.multiAgent?.enabled !== false,
      maxFanOut: this.deps.multiAgent?.maxFanOut ?? 8,
      maxDepth: this.deps.multiAgent?.maxDepth ?? 3,
      detectCycles: this.deps.multiAgent?.detectCycles !== false,
      handoffMaxChars: this.deps.multiAgent?.handoffMaxChars ?? 4000,
      handoffMaxKeyPoints: this.deps.multiAgent?.handoffMaxKeyPoints ?? 12,
      handoffMaxTotalChars: this.deps.multiAgent?.handoffMaxTotalChars ?? 12000,
      allowInvoke: this.deps.multiAgent?.allowInvoke !== false,
    };
  }

  private handoffLimits(): HandoffLimits {
    const multi = this.multiAgentConfig();
    return {
      maxChars: multi.handoffMaxChars,
      maxKeyPoints: multi.handoffMaxKeyPoints,
    };
  }

  /** Reset per-design call root + seed handoffs from resumed task results. */

  private clearTraceTokenBudget(traceId?: string): void {
    clearTraceTokenBudget(this.deps.hooks, traceId);
  }

  async execute(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    options?: DirectorStreamOptions
  ): Promise<AgentResponse> {
    return this.withRootTrace(sessionId, mode, options, async (traceId) => {
      let result: AgentResponse;
      switch (mode) {
          case "design":
            result = await this.executor.executeDesignFlow(requirement, sessionId, role, traceId, options);
            break;
          case "query":
            result = await this.executor.executeQueryFlow(requirement, sessionId, traceId, history, options?.signal);
            break;
          case "table":
            result = await this.executor.executeTableFlow(requirement, sessionId, role, traceId, options);
            break;
        }
        return {
          ...result,
          metadata: { ...result.metadata, traceId },
        };
    });
  }

  async *executeStream(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    options?: DirectorStreamOptions
  ): AsyncIterable<StreamEvent> {
    const tracer = this.deps.tracer;
    const userId = options?.userId ?? this.deps.resolveUserId?.();
    if (!tracer || !userId || !tracer.bindTrace) {
      yield* this.executeStreamInner(requirement, sessionId, mode, role, history, options);
      return;
    }

    const handle = await tracer.startTrace({
      sessionId,
      userId,
      name: `director.${mode}`,
      executionId: options?.executionId,
      attributes: { mode, role },
    });
    const unbind = tracer.bindTrace(handle);
    let status: "ok" | "error" = "ok";
    try {
      let startInjected = false;
      const inner = this.executeStreamInner(requirement, sessionId, mode, role, history, options);
      // Re-enter the trace context per next(): workers interleave their own
      // awaits between yields, which would otherwise drop the ALS store from
      // the generator continuation (spans/endTrace silently lost).
      const traced = tracer.wrapTraceStream ? tracer.wrapTraceStream(handle, inner) : inner;
      for await (const event of traced) {
        if (!startInjected && event.type === "start") {
          startInjected = true;
          yield {
            ...event,
            data: { ...event.data, traceId: handle.traceId },
          };
        } else if (event.type === "complete" || event.type === "error" || event.type === "cancelled") {
          yield {
            ...event,
            data: { ...event.data, traceId: handle.traceId },
          };
        } else {
          yield event;
        }
      }
    } catch (err) {
      status = "error";
      throw err;
    } finally {
      await tracer.endTrace(handle.traceId, status);
      clearTraceTokenBudget(this.deps.hooks, handle.traceId);
      unbind();
    }
  }

  private async *executeStreamInner(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string,
    history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
    options: DirectorStreamOptions | undefined,
  ): AsyncGenerator<StreamEvent> {
    const signal = options?.signal;
    switch (mode) {
      case "query":
        yield* this.executor.executeQueryStream(requirement, sessionId, history, signal, options);
        break;
      case "design":
      case "table":
        yield* this.executor.executeDesignStream(requirement, sessionId, role, options);
        break;
    }
  }

  private async withRootTrace<T>(
    sessionId: string,
    mode: string,
    options: DirectorStreamOptions | undefined,
    fn: (traceId: string | undefined) => Promise<T>,
  ): Promise<T> {
    const tracer = this.deps.tracer;
    const userId = options?.userId ?? this.deps.resolveUserId?.();
    if (!tracer || !userId) {
      return fn(undefined);
    }
    const handle = await tracer.startTrace({
      sessionId,
      userId,
      name: `director.${mode}`,
      executionId: options?.executionId,
      attributes: { mode },
    });
    let status: "ok" | "error" = "ok";
    return tracer.withTrace(handle, async () => {
      try {
        return await fn(handle.traceId);
      } catch (err) {
        status = "error";
        throw err;
      } finally {
        await tracer.endTrace(handle.traceId, status);
        clearTraceTokenBudget(this.deps.hooks, handle.traceId);
      }
    });
  }













}
