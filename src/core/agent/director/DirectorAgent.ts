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
import type { UserIntent } from "./IntentClassifier.js";


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
  /**
   * 会话历史（客户端带来的多轮对话）。design/table 模式经
   * buildSessionContextBlock 蒸馏后注入 TaskPlanner 与子 Agent；
   * query 模式仍直接使用 executeStream 的 history 参数。
   */
  sessionHistory?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
}

export type { KnowledgeSource } from "./KnowledgeSource.js";

export interface DirectorPrompts {
  querySystem?: string;
  taskPlanner?: string;
  router?: string;
  /** 闲聊直答系统提示（prompts/direct_chat.md）。 */
  directChat?: string;
}

/** Plan hard-guard knobs injected from FrameworkConfig.guards (composition root). */
export interface DirectorPlanHardConfig {
  enabled: boolean;
  maxReplans: number;
  /** Ceiling for one replan round (replanner LLM call), ms. 0/undefined disables. */
  replanTimeoutMs?: number;
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
    /**
     * 当前生效模型的上下文窗口（tokens），BYOK 命中时为用户模型的窗口。
     * 压缩预算 = compressionThreshold × min(maxTokens, contextWindow)；
     * 返回 null（注册表无该模型）时按 maxTokens 原值。
     */
    contextWindow?: () => number | null;
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
  /**
   * 会话上下文注入限值（composition root 来自 FrameworkConfig.execution）。
   * 缺省视为关闭（maxMessages=0）。0 = kill-switch。
   */
  sessionContext?: {
    maxMessages: number;
    maxChars: number;
  };
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
  /**
   * design/table 模式闲聊快路径：意图分类命中 chat 时直接对话回复，
   * 不进规划/工作流。enabled=false 或 classify 缺失时完全跳过；
   * classify 结果 fail-safe（超时/异常一律 task，由 IntentClassifier 保证）。
   */
  chatFastPath?: {
    enabled: boolean;
    classify: (
      requirement: string,
      history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    ) => Promise<UserIntent>;
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
        sessionContextLimits: () => this.sessionContextLimits(),
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
        sessionContextLimits: () => this.sessionContextLimits(),
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

  private sessionContextLimits(): { maxMessages: number; maxChars: number } {
    return {
      maxMessages: this.deps.sessionContext?.maxMessages ?? 0,
      maxChars: this.deps.sessionContext?.maxChars ?? 0,
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
      if (mode === "design" || mode === "table") {
        const direct = await this.tryDirectChatFlow(requirement, sessionId, mode, role, history, options);
        if (direct) {
          return { ...direct, metadata: { ...direct.metadata, traceId } };
        }
      }
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
    if (mode === "design" || mode === "table") {
      const answered = yield* this.tryDirectChatStream(requirement, sessionId, mode, role, history, options);
      if (answered) return;
    }
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

  /**
   * 闲聊快路径（流式）：命中 chat 时产出完整直答事件流并返回 true。
   * 任何跳过条件（未启用 / HITL 续跑 / 判为 task / 分类失败）都静默放行
   * 返回 false，不产出任何事件、不影响原流程。
   */
  private async *tryDirectChatStream(
    requirement: string,
    sessionId: string,
    mode: "design" | "table",
    role: string,
    history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
    options: DirectorStreamOptions | undefined,
  ): AsyncGenerator<StreamEvent, boolean> {
    const fp = this.deps.chatFastPath;
    if (!fp?.enabled || !fp.classify) return false;
    // HITL 审阅后的续跑：requirement 是原始需求，必然是 task，跳过分类省一次调用。
    if (options?.resumePlan || (options?.initialTaskResults?.length ?? 0) > 0) return false;

    let intent: UserIntent;
    try {
      intent = await fp.classify(requirement, history);
    } catch {
      return false;
    }
    if (intent !== "chat") return false;

    this.logger.info(`[DirectorAgent] chat fast-path hit, direct reply (mode=${mode}, role=${role})`);
    void this.executor.safeRecordPlanSpan("intent.chat_hit", { mode, role, chars: requirement.length });
    yield* this.executor.executeDirectChatStream(requirement, sessionId, mode, role, history, options);
    return true;
  }

  /** 闲聊快路径（非流式）：命中 chat 返回直答 AgentResponse，否则 null。 */
  private async tryDirectChatFlow(
    requirement: string,
    sessionId: string,
    mode: "design" | "table",
    role: string,
    history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
    options: DirectorStreamOptions | undefined,
  ): Promise<AgentResponse | null> {
    const fp = this.deps.chatFastPath;
    if (!fp?.enabled || !fp.classify) return null;
    if (options?.resumePlan || (options?.initialTaskResults?.length ?? 0) > 0) return null;

    let intent: UserIntent;
    try {
      intent = await fp.classify(requirement, history);
    } catch {
      return null;
    }
    if (intent !== "chat") return null;

    this.logger.info(`[DirectorAgent] chat fast-path hit, direct reply (mode=${mode}, role=${role})`);
    void this.executor.safeRecordPlanSpan("intent.chat_hit", { mode, role, chars: requirement.length });
    return this.executor.executeDirectChatFlow(requirement, sessionId, role, history, options);
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
