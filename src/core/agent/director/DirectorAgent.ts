import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { AgentResponse as AR } from "../../../port/agent/AgentResponse.js";
import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../port/agent/AgentFactory.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../../observability/ConsoleLogger.js";
import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../../port/tool/ToolRegistry.js";
import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { SkillRegistry } from "../../../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "./HumanReviewGateway.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import type { IdGeneratorPort } from "../../../port/infra/IdGeneratorPort.js";
import type { TracerPort } from "../../../port/tracing/TracerPort.js";
import type { WorkspaceManager } from "../../workspace/WorkspaceManager.js";
import { Integrator } from "./Integrator.js";
import { DirectorContext } from "./DirectorContext.js";
import { ToolPlanResolver } from "./ToolPlanResolver.js";
import { clearTraceTokenBudget } from "./traceBudget.js";
import { ErrorClassifier } from "../../execution/ErrorClassifier.js";
import {
  buildCancellationPayload,
  isCancellationScenario,
} from "../../execution/CancellationPayload.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { EventBus } from "./EventBus.js";
import { StreamEmitterHook } from "../../hook/StreamEmitterHook.js";
import type { BlackboardStorePort } from "../../../port/blackboard/BlackboardPort.js";
import { isToolHitlRequiredError, type ToolHitlRequiredError } from "../../tool/ToolHitlRequiredError.js";
import type { ExecutionOverrides } from "../../versioning/buildExecutionOverrides.js";
import { PlanReplanner } from "../../plan/PlanReplanner.js";
import { runPlanWithReplan } from "../../plan/runPlanWithReplan.js";
import { AgentCallGuard, AGENT_INVOKE_TOOL_NAME, type CallContext, distillHandoff, isHandoffViolationError, isMultiAgentGuardError, seedHandoffsFromResults, validateHandoff, type HandoffLimits, type HandoffPayload } from "../../multiagent/index.js";
import { decideFaqHit } from "../../faq/decideFaqHit.js";
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
  private integrator: Integrator;
  private skillCtx: DirectorContext;
  private planResolver: ToolPlanResolver;
  private callGuard: AgentCallGuard;
  private callRoot: CallContext;
  private activeCallParent: CallContext;
  private readonly handoffByTask = new Map<string, HandoffPayload>();

  private readonly logger: LoggerPort;

  constructor(private deps: DirectorDeps) {
    this.logger = deps.logger ?? new ConsoleLogger();
    this.skillCtx = new DirectorContext(deps, this.logger);
    this.integrator = new Integrator();
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
      runNestedAgentInvoke: (input) => this.runNestedAgentInvoke(input),
      safeRecordPlanSpan: (name, attributes) => this.safeRecordPlanSpan(name, attributes),
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
  private async beginMultiAgentRun(initialResults?: readonly TaskResult[]): Promise<void> {
    const multi = this.multiAgentConfig();
    this.callGuard = new AgentCallGuard({
      maxDepth: multi.maxDepth,
      detectCycles: multi.detectCycles,
    });
    this.callRoot = this.callGuard.root("Director");
    this.activeCallParent = this.callRoot;
    this.handoffByTask.clear();

    const seeded = seedHandoffsFromResults(
      initialResults ?? [],
      this.handoffLimits(),
      (info) => {
        void this.safeRecordPlanSpan("guard.handoff_violation", { ...info });
      },
    );
    for (const [taskId, handoff] of seeded) {
      this.handoffByTask.set(taskId, handoff);
    }
  }

  private clearTraceTokenBudget(traceId?: string): void {
    clearTraceTokenBudget(this.deps.hooks, traceId);
  }

  private buildTaskHandoff(
    task: TaskAssignment,
    output: string,
  ): HandoffPayload | undefined {
    const multi = this.multiAgentConfig();
    if (!multi.enabled) return undefined;
    const limits = this.handoffLimits();
    const handoff = distillHandoff({
      taskId: task.taskId,
      domain: task.domain,
      output,
      artifacts: ["output.md"],
      limits,
    });
    validateHandoff(handoff, limits);
    this.handoffByTask.set(task.taskId, handoff);
    return handoff;
  }

  private async safeRecordPlanSpan(
    name: string,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.deps.tracer?.recordSpan({
        name,
        kind: "internal",
        status: name.includes("denied") || name.includes("exhausted") ? "error" : "ok",
        attributes,
      });
    } catch {
      // Trace must never break plan execution.
    }
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
            result = await this.executeDesignFlow(requirement, sessionId, role, traceId, options);
            break;
          case "query":
            result = await this.executeQueryFlow(requirement, sessionId, traceId, history, options?.signal);
            break;
          case "table":
            result = await this.executeTableFlow(requirement, sessionId, role, traceId, options);
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
        yield* this.executeQueryStream(requirement, sessionId, history, signal, options);
        break;
      case "design":
      case "table":
        yield* this.executeDesignStream(requirement, sessionId, role, options);
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

  private async executeDesignFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    options?: DirectorStreamOptions,
  ): Promise<AgentResponse> {
    const signal = options?.signal;
    if (role !== "chief_designer") {
      return this.executeSingleRoleFlow(requirement, sessionId, role, traceId, signal, options);
    }

    if (this.deps.workspace) {
      await this.deps.workspace.initialize(sessionId);
    }

    await this.beginMultiAgentRun(options?.initialTaskResults);

    const skill = this.skillCtx.skillRegistry(options).matchSkill(requirement, role);
    this.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
    const plan = await this.skillCtx.getTaskPlanner(options).plan(requirement, role, skill);

    const reviewedPlan = await this.deps.humanReviewGateway.requestReview(
      sessionId,
      "hitl-1-task-plan",
      plan,
      { executionId: options?.executionId, resumeCursor: "after_plan" },
    );
    if (reviewedPlan.decision === "pending") {
      return {
        agentName: "Director",
        message: ChatMessage.text(
          "assistant",
          "Director",
          `等待人工审阅任务计划（checkpoint=${reviewedPlan.checkpointId ?? "unknown"}）`,
        ),
        metadata: {
          waitingHitl: true,
          checkpointId: reviewedPlan.checkpointId ?? null,
          plan,
        },
        success: true,
        errorMessage: null,
      };
    }
    if (reviewedPlan.decision === "rejected") {
      return {
        agentName: "Director",
        message: ChatMessage.text("assistant", "Director", reviewedPlan.feedback ?? "任务计划被驳回"),
        metadata: { rejected: true },
        success: false,
        errorMessage: reviewedPlan.feedback ?? "任务计划被驳回",
      };
    }

    const routing = await this.skillCtx.getRouter(options).route(reviewedPlan.modifications ?? plan, role);

    const assignments = this.planResolver.mapRoutingToAssignments(
      reviewedPlan.modifications ?? plan,
      routing,
      options,
    );

    if (this.deps.workspace) {
      for (const assignment of assignments) {
        this.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
      }
    }

    const mergedPlan = this.planResolver.buildMergedExecutablePlan(
      reviewedPlan.modifications ?? plan,
      assignments,
      requirement,
    );

    const planHard = this.planHardConfig();
    const assignmentsById = new Map(assignments.map((a) => [a.taskId, a]));
    const replanner = new PlanReplanner(this.deps.model, {
      domainToolDefaults: planHard.domainToolDefaults,
    });

    const runResult = await runPlanWithReplan({
      plan: mergedPlan,
      enabled: planHard.enabled,
      maxReplans: planHard.maxReplans,
      replanner,
      initialResults: options?.initialTaskResults,
      onAudit: (name, attributes) => this.safeRecordPlanSpan(name, attributes),
      onReplan: async ({ remaining, plan: nextPlan }) => {
        const fragment: TaskPlan = {
          planId: nextPlan.planId,
          requirement: nextPlan.requirement,
          subTasks: [...remaining],
        };
        const reRoute = await this.skillCtx.getRouter(options).route(fragment, role);
        for (const a of this.planResolver.mapRoutingToAssignments(fragment, reRoute, options)) {
          assignmentsById.set(a.taskId, a);
          this.deps.workspace?.registerTaskDir(sessionId, a.taskId, a.domain);
        }
      },
      executor: (task, taskSignal) => {
        const existing = assignmentsById.get(task.id);
        const assignment: TaskAssignment = existing
          ? {
              ...existing,
              assignment: task.description,
              dependencies: task.dependencies,
              allowedTools: task.allowedTools ?? existing.allowedTools,
            }
          : {
              taskId: task.id,
              domain: task.domain,
              assignment: task.description,
              agentDescriptor: this.skillCtx.getAgentDescriptor("SystemDesigner", options)!,
              dependencies: task.dependencies,
              allowedTools: task.allowedTools,
            };
        assignmentsById.set(task.id, assignment);
        return this.executeSingleTask(assignment, sessionId, traceId, undefined, taskSignal, options);
      },
      pipelineOptions: {
        signal,
        taskTimeoutMs: options?.taskTimeoutMs,
        planHardEnabled: planHard.enabled,
        maxFanOut: this.multiAgentConfig().enabled ? this.multiAgentConfig().maxFanOut : 0,
        onFanOutBatch: (info) => this.safeRecordPlanSpan("guard.fan_out_batch", { ...info }),
        inFlightPartialOutputTimeoutMs: this.deps.limits?.inFlightPartialOutputTimeoutMs,
      },
    });

    const results = runResult.results;

    if (runResult.exhausted) {
      const failed = results.find((r) => r.status === "error");
      return {
        agentName: "Director",
        message: ChatMessage.text(
          "assistant",
          "Director",
          `重规划次数耗尽（${runResult.replanCount}/${planHard.maxReplans}）`
            + (failed ? `；最近失败任务=${failed.taskId}` : ""),
        ),
        metadata: {
          replanCount: runResult.replanCount,
          replanExhausted: true,
          results,
        },
        success: false,
        errorMessage: `重规划次数耗尽（已重规划 ${runResult.replanCount}/${planHard.maxReplans} 次）`,
      };
    }

    const completedCount = results.filter((r) => r.status === "success").length;

    // Structured integration: field registry + conflict detection + per-agent docs.
    const integration = await this.integrateAndPersist(results, sessionId);

    const fileList = results
      .filter((r) => r.status === "success")
      .map((r) => {
        const dirName = this.deps.workspace
          ? this.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
          : r.taskId;
        return `- ${dirName}/output.md`;
      })
      .join("\n");

    const conflictNote = integration.conflictCount > 0
      ? `\n\n⚠️ 检测到 **${integration.conflictCount}** 处字段冲突，详见 \`final/冲突报告.md\`。`
      : "";

    const summary = `## ✅ 策划方案已生成\n\n共完成 **${completedCount}** 个子任务，所有产出已保存到工作空间：\n\n${fileList || "- （无成功产出）"}${conflictNote}\n\n---\n\n📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  \n📦 也可以直接点击「打包下载全部」获取 ZIP。`;

    return {
      agentName: "Director",
      message: ChatMessage.text("assistant", "Director", summary),
      metadata: { fileCount: completedCount, conflictCount: integration.conflictCount },
      success: true,
      errorMessage: null,
    };
  }

  /**
   * Run structured integration over sub-agent results: populate a field
   * registry, detect cross-agent conflicts, and persist synthesized documents
   * (conflict report + field registry) into the workspace `final/` directory.
   * Returns the conflict count and the list of extra files written.
   */
  private async integrateAndPersist(
    results: TaskResult[],
    sessionId: string,
  ): Promise<{ conflictCount: number; extraFiles: string[] }> {
    const integration = this.integrator.integrateStructured(results);
    const extraFiles: string[] = [];

    if (this.deps.workspace) {
      for (const doc of integration.documents) {
        // Only persist synthesized reports here; per-agent outputs are already
        // written to each task dir as output.md during execution.
        if (doc.taskId === "conflicts" || doc.taskId === "field_registry") {
          const fileName = `final/${doc.fileName}.md`;
          await this.deps.workspace.writeFile(sessionId, fileName, doc.markdownContent);
          extraFiles.push(fileName);
        }
      }
    }

    return { conflictCount: integration.conflicts.length, extraFiles };
  }


  private async executeSingleTask(
    task: TaskAssignment,
    sessionId: string,
    _traceId?: string,
    additionalHook?: AgentHook,
    signal?: AbortSignal,
    options?: DirectorStreamOptions,
  ): Promise<TaskResult> {
    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        domain: task.domain,
        status: "cancelled",
        output: "",
        errorMessage: "Task cancelled by user",
      };
    }

    const multi = this.multiAgentConfig();
    const prevCallParent = this.activeCallParent;
    try {
      const memoryPort = await this.skillCtx.createMemoryPort();
      const hooks = additionalHook ? [...this.deps.hooks, additionalHook] : this.deps.hooks;

      const { descriptor, toolRegistry } = this.planResolver.prepareTaskAgent(task, sessionId, options);

      const parent = options?.callParent ?? this.callRoot;
      if (multi.enabled) {
        this.activeCallParent = this.callGuard.enter(descriptor.name, parent);
      } else {
        this.activeCallParent = parent;
      }

      const agent = this.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        memoryPort,
        hooks
      );

      const enhancedAssignment = await this.planResolver.injectPredecessorContext(task, sessionId);
      const input = ChatMessage.text("user", "director", enhancedAssignment);
      const response = await agent.process(sessionId, [input], signal ? { signal } : undefined);

      if (signal?.aborted || response.metadata?.aborted) {
        const output = AR.getTextContent(response) ?? "";
        return {
          taskId: task.taskId,
          domain: task.domain,
          status: "cancelled",
          output,
          errorMessage: response.errorMessage ?? "Task cancelled by user",
          errorClass: "cancelled",
        };
      }

      let output = AR.getTextContent(response) ?? "";
      if (!output.trim()) {
        output = "(子 Agent 返回空内容)";
      }
      if (this.deps.workspace && output) {
        await this.deps.workspace.writeTaskOutput(sessionId, task.taskId, "output.md", output);
      }

      let handoff: HandoffPayload | undefined;
      if (response.success) {
        try {
          handoff = this.buildTaskHandoff(task, output);
        } catch (err) {
          if (isHandoffViolationError(err)) {
            await this.safeRecordPlanSpan("guard.handoff_violation", {
              taskId: task.taskId,
              reason: err.reason,
              field: err.field,
            });
            return {
              taskId: task.taskId,
              domain: task.domain,
              status: "error",
              output,
              errorMessage: err.message,
              errorClass: "permanent",
            };
          }
          throw err;
        }
      }

      return {
        taskId: task.taskId,
        domain: task.domain,
        status: response.success ? "success" : "error",
        output,
        errorMessage: response.errorMessage,
        errorClass: response.success
          ? undefined
          : ErrorClassifier.classify(response.errorMessage ?? "Agent execution failed"),
        handoff,
      };
    } catch (err) {
      if (isMultiAgentGuardError(err)) {
        await this.safeRecordPlanSpan(`guard.${err.code}`, {
          agentName: err.agentName,
          path: err.path,
          depth: err.depth,
          maxDepth: err.maxDepth,
          reason: err.reason,
        });
        return {
          taskId: task.taskId,
          domain: task.domain,
          status: "error",
          output: "",
          errorMessage: err.message,
          errorClass: "permanent",
        };
      }
      throw err;
    } finally {
      this.activeCallParent = prevCallParent;
    }
  }

  /**
   * Nested Agent-as-Tool runner. CallContext for `agentName` was already entered
   * by {@link AgentInvokeTool} / invokeSubAgent — do not enter again.
   */
  private async runNestedAgentInvoke(input: {
    agentName: string;
    assignment: string;
    callParent: CallContext;
    sessionId: string;
    signal?: AbortSignal;
    options?: DirectorStreamOptions;
  }): Promise<string> {
    const prev = this.activeCallParent;
    this.activeCallParent = input.callParent;
    try {
      const base = this.skillCtx.getAgentDescriptor(input.agentName, input.options);
      if (!base) {
        throw new Error(`Unknown agent for invoke_agent: ${input.agentName}`);
      }
      const multi = this.multiAgentConfig();
      let descriptor: AgentDescriptor = { ...base };
      if (multi.enabled && multi.allowInvoke) {
        descriptor = {
          ...descriptor,
          toolNames: Array.from(new Set([...descriptor.toolNames, AGENT_INVOKE_TOOL_NAME])),
        };
      }
      const memoryPort = await this.skillCtx.createMemoryPort();
      const toolRegistry = this.planResolver.buildSessionToolRegistry(
        input.sessionId,
        input.agentName,
        input.options,
      );
      const agent = this.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        memoryPort,
        this.deps.hooks,
      );
      const message = ChatMessage.text("user", "director", input.assignment);
      const response = await agent.process(
        input.sessionId,
        [message],
        input.signal ? { signal: input.signal } : undefined,
      );
      return AR.getTextContent(response) ?? "";
    } finally {
      this.activeCallParent = prev;
    }
  }

  /**
   * Background event drain generator: yields accumulated EventBus events
   * every 200ms until the `done` flag is set. Designed to run concurrently
   * with blocking agent execution via Promise.all, so the SSE client
   * receives real-time progress events instead of a post-execution dump.
   */
  private async *concurrentDrain(eventBus: EventBus, done: { value: boolean }): AsyncGenerator<StreamEvent> {
    const drainIntervalMs = this.deps.limits?.eventDrainIntervalMs ?? 200;
    while (!done.value) {
      await new Promise((r) => setTimeout(r, drainIntervalMs));
      for (const event of eventBus.drain()) {
        yield event;
      }
    }
    // Final drain to catch any events emitted in the last interval
    for (const event of eventBus.drain()) {
      yield event;
    }
  }

  private async executeQueryFlow(
    requirement: string,
    sessionId: string,
    traceId?: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal
  ): Promise<AgentResponse> {
    const agent = await this.planResolver.createQueryAgent(sessionId);

    const messages: import("../../../port/message/ChatMessage.js").ChatMessage[] = [];
    if (history?.length) {
      for (const h of history) {
        messages.push(ChatMessage.text(h.role === "user" ? "user" : "assistant", h.role, h.content));
      }
    }
    messages.push(ChatMessage.text("user", "user", requirement));

    const response = await agent.process(sessionId, messages, signal ? { signal } : undefined);
    return {
      agentName: "Director",
      message: response.message,
      metadata: {},
      success: response.success,
      errorMessage: response.errorMessage,
    };
  }

  private async *executeQueryStream(
    requirement: string,
    sessionId: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal,
    options?: DirectorStreamOptions,
  ): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "query" } };

    const fp = this.deps.faqFastPath;
    if (fp?.enabled) {
      try {
        const raw = await fp.match(requirement);
        const decision = decideFaqHit(raw, fp.threshold);
        if (decision.ok) {
          this.logger.info(`[DirectorAgent] faq.hit score=${decision.score} faqId=${decision.faqId ?? ""}`);
          void this.safeRecordPlanSpan("faq.hit", {
            score: decision.score,
            faqId: decision.faqId ?? "",
            question: decision.question ?? "",
          });
          yield {
            type: "faq_hit",
            data: { score: decision.score, faqId: decision.faqId, question: decision.question },
          };
          yield { type: "chunk", data: { text: decision.answer } };
          yield { type: "complete", data: { success: true, output: decision.answer, source: "faq" } };
          return;
        }
        this.logger.info(`[DirectorAgent] faq.miss reason=${decision.reason}`);
        void this.safeRecordPlanSpan("faq.miss", { reason: decision.reason });
      } catch (err) {
        this.logger.warn("[DirectorAgent] faq.error", {
          error: err instanceof Error ? err.message : String(err),
        });
        void this.safeRecordPlanSpan("faq.error", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Create EventBus and StreamEmitterHook for fine-grained events
    const eventBus = new EventBus();
    const streamEmitterHook = new StreamEmitterHook(eventBus, {
      grepLimit: this.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.deps.limits?.webSourceResultLimit,
    });
    const hooksWithEmitter = [...this.deps.hooks, streamEmitterHook];

    try {
      const agent = await this.planResolver.createQueryAgentWithHooks(
        hooksWithEmitter,
        sessionId,
        this.skillCtx.getQuerySystemPrompt(options),
      );

      const messages: import("../../../port/message/ChatMessage.js").ChatMessage[] = [];
      if (history?.length) {
        for (const h of history) {
          messages.push(ChatMessage.text(h.role === "user" ? "user" : "assistant", h.role, h.content));
        }
      }
      messages.push(ChatMessage.text("user", "user", requirement));

      let finalOutput = "";
      let streamError: string | null = null;
      const streamingEnabled = this.deps.streamingEnabled !== false;
      let streamed = "";
      const done = { value: false };
      const processOptions = {
        ...(signal ? { signal } : {}),
        streamingEnabled,
        onTextDelta: (delta: string) => {
          streamed += delta;
          eventBus.emit({ type: "chunk", data: { text: delta } });
        },
      };

      // Run process* in background so concurrentDrain can push onTextDelta
      // chunks to SSE before the full LLM turn finishes (true TTFT).
      const runPromise = (async () => {
        try {
          if (agent.processStream) {
            for await (const response of agent.processStream(
              sessionId,
              messages,
              processOptions,
            )) {
              if (!response.success) {
                streamError = response.errorMessage ?? "Agent execution failed";
                return;
              }
              const text = response.message ? ChatMessage.textContent(response.message) : "";
              if (text) {
                finalOutput = text;
                if (!streamingEnabled || !streamed) {
                  eventBus.emit({ type: "chunk", data: { text } });
                } else if (text.length > streamed.length && text.startsWith(streamed)) {
                  eventBus.emit({ type: "chunk", data: { text: text.slice(streamed.length) } });
                }
              }
            }
          } else {
            const response = await agent.process(sessionId, messages, processOptions);
            if (!response.success) {
              streamError = response.errorMessage ?? "Agent execution failed";
              return;
            }
            finalOutput = response.message ? ChatMessage.textContent(response.message) : "";
            if (finalOutput) {
              eventBus.emit({ type: "chunk", data: { text: finalOutput } });
            }
          }
        } finally {
          done.value = true;
        }
      })();

      for await (const event of this.concurrentDrain(eventBus, done)) {
        yield event;
      }
      await runPromise;

      if (streamError) {
        yield { type: "error", data: { error: streamError } };
        return;
      }

      if (signal?.aborted) {
        yield {
          type: "cancelled",
          data: {
            ...buildCancellationPayload([], finalOutput, "Query execution cancelled"),
          },
        };
        return;
      }

      yield { type: "complete", data: { success: true, output: finalOutput } };
    } catch (err) {
      if (isToolHitlRequiredError(err)) {
        for (const event of eventBus.drain()) {
          yield event;
        }
        yield this.toolHitlStreamEvent(err);
        return;
      }
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async *executeDesignStream(
    requirement: string,
    sessionId: string,
    role: string,
    options?: DirectorStreamOptions,
  ): AsyncIterable<StreamEvent> {
    const signal = options?.signal;
    if (role !== "chief_designer") {
      yield* this.executeSingleRoleStream(requirement, sessionId, role, signal, options);
      return;
    }

    yield { type: "start", data: { sessionId, mode: "design", role } };

    // Create EventBus and StreamEmitterHook for fine-grained events
    const eventBus = new EventBus();
    const streamEmitterHook = new StreamEmitterHook(eventBus, {
      grepLimit: this.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.deps.limits?.webSourceResultLimit,
    });

    try {
      if (this.deps.workspace) {
        await this.deps.workspace.initialize(sessionId);
      }

      await this.beginMultiAgentRun(options?.initialTaskResults);

      const skill = this.skillCtx.skillRegistry(options).matchSkill(requirement, role);
      this.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
      let plan = options?.resumePlan;
      if (plan) {
        yield { type: "plan", data: { message: `Resuming ${plan.subTasks.length} tasks`, plan, resumed: true } };
      } else {
        yield {
          type: "plan",
          data: {
            message: "正在进行任务规划…",
            phase: "plan",
            matchedSkill: skill?.getName() ?? null,
          },
        };
        try {
          plan = await this.skillCtx.getTaskPlanner(options).plan(requirement, role, skill);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          yield {
            type: "error",
            data: {
              error: `任务规划失败: ${detail}`,
              phase: "plan",
              errorClass: "permanent",
            },
          };
          return;
        }
        if (plan.warnings && plan.warnings.length > 0) {
          yield {
            type: "plan",
            data: {
              message: plan.warnings.join("；"),
              warning: true,
              phase: "plan",
              plan,
              matchedSkill: skill?.getName() ?? null,
            },
          };
        }
        yield {
          type: "plan",
          data: {
            message: `已规划 ${plan.subTasks.length} 个任务`,
            plan,
            matchedSkill: skill?.getName() ?? null,
            fallback: plan.fallback === true,
          },
        };
      }

      const reviewedPlan = options?.resumePlan
        ? { decision: "approved" as const, modifications: undefined }
        : await this.deps.humanReviewGateway.requestReview(
          sessionId,
          "hitl-1-task-plan",
          plan,
          { executionId: options?.executionId, resumeCursor: "after_plan" },
        );

      if (reviewedPlan.decision === "pending") {
        yield {
          type: "hitl",
          data: {
            checkpointId: reviewedPlan.checkpointId,
            reviewPoint: "hitl-1-task-plan",
            status: "waiting_review",
            resumeCursor: "after_plan",
            plan,
            feedback: reviewedPlan.feedback ?? "任务计划等待人工审阅",
            message: "任务计划已生成，等待人工审阅后继续",
          },
        };
        return;
      }

      if (reviewedPlan.decision === "rejected") {
        yield {
          type: "error",
          data: {
            error: reviewedPlan.feedback ?? "任务计划被驳回",
            phase: "plan_review",
            errorClass: "permanent",
            rejected: true,
            fallback: reviewedPlan.fallback === true,
          },
        };
        return;
      }

      yield { type: "route", data: { message: "正在路由分配子任务…", phase: "route" } };
      const activePlan = reviewedPlan.modifications ?? plan;
      let routing;
      try {
        routing = await this.skillCtx.getRouter(options).route(activePlan, role);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        yield {
          type: "error",
          data: {
            error: `任务路由失败: ${detail}`,
            phase: "route",
            errorClass: "permanent",
          },
        };
        return;
      }
      yield { type: "route", data: { message: `已路由到 ${routing.length} 个 Agent`, routing } };

      const assignments = this.planResolver.mapRoutingToAssignments(activePlan, routing, options);

      if (this.deps.workspace) {
        for (const assignment of assignments) {
          this.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
        }
      }

      const mergedPlan = this.planResolver.buildMergedExecutablePlan(activePlan, assignments, requirement);
      yield { type: "plan", data: { message: "Executable plan ready", plan: mergedPlan, executable: true } };

      const planHard = this.planHardConfig();
      const assignmentsById = new Map(assignments.map((a) => [a.taskId, a]));
      const replanner = new PlanReplanner(this.deps.model, {
        domainToolDefaults: planHard.domainToolDefaults,
      });

      const done = { value: false };
      const runPromise = runPlanWithReplan({
        plan: mergedPlan,
        enabled: planHard.enabled,
        maxReplans: planHard.maxReplans,
        replanner,
        initialResults: options?.initialTaskResults,
        onAudit: (name, attributes) => this.safeRecordPlanSpan(name, attributes),
        onReplan: async ({ remaining, plan: nextPlan, replanCount, failedTaskId }) => {
          const fragment: TaskPlan = {
            planId: nextPlan.planId,
            requirement: nextPlan.requirement,
            subTasks: [...remaining],
          };
          const reRoute = await this.skillCtx.getRouter(options).route(fragment, role);
          for (const a of this.planResolver.mapRoutingToAssignments(fragment, reRoute, options)) {
            assignmentsById.set(a.taskId, a);
            this.deps.workspace?.registerTaskDir(sessionId, a.taskId, a.domain);
          }
          eventBus.emit({
            type: "replan",
            data: {
              replanCount,
              failedTaskId,
              remainingCount: remaining.length,
              plan: nextPlan,
            },
          });
        },
        executor: (task, taskSignal) => {
          const existing = assignmentsById.get(task.id);
          const assignment: TaskAssignment = existing
            ? {
                ...existing,
                assignment: task.description,
                dependencies: task.dependencies,
                allowedTools: task.allowedTools ?? existing.allowedTools,
              }
            : {
                taskId: task.id,
                domain: task.domain,
                assignment: task.description,
                agentDescriptor: this.skillCtx.getAgentDescriptor("SystemDesigner", options)!,
                dependencies: task.dependencies,
                allowedTools: task.allowedTools,
              };
          assignmentsById.set(task.id, assignment);
          return this.executeSingleTask(
            assignment,
            sessionId,
            undefined,
            streamEmitterHook,
            taskSignal,
            options,
          );
        },
        pipelineOptions: {
          signal,
          taskTimeoutMs: options?.taskTimeoutMs,
          planHardEnabled: planHard.enabled,
          maxFanOut: this.multiAgentConfig().enabled ? this.multiAgentConfig().maxFanOut : 0,
          onFanOutBatch: (info) => this.safeRecordPlanSpan("guard.fan_out_batch", { ...info }),
          inFlightPartialOutputTimeoutMs: this.deps.limits?.inFlightPartialOutputTimeoutMs,
          onTaskStart: (task) => eventBus.emit({
            type: "task_start",
            data: {
              taskId: task.id,
              domain: task.domain,
              description: task.description,
              agentName: assignmentsById.get(task.id)?.agentDescriptor.name,
            },
          }),
          onTaskResult: (task, result) => eventBus.emit({
            type: "task_complete",
            data: {
              taskId: task.id,
              domain: task.domain,
              status: result.status,
              output: result.output,
              errorMessage: result.errorMessage,
              errorClass: result.errorClass,
            },
          }),
        },
      }).finally(() => { done.value = true; });

      for await (const event of this.concurrentDrain(eventBus, done)) {
        yield event;
      }
      const runResult = await runPromise;
      for (const event of eventBus.drain()) {
        yield event;
      }
      const results = runResult.results;

      const failedResult = results.find(
        (result) => result.status === "error",
      );
      const cancelledScenario = isCancellationScenario(results, signal);

      if (cancelledScenario) {
        const successOutputs = results
          .filter((result) => result.status === "success" && result.output.trim())
          .map((result) => `### ${result.taskId}\n${result.output}`)
          .join("\n\n");
        yield {
          type: "cancelled",
          data: {
            ...buildCancellationPayload(
              results,
              successOutputs || undefined,
              "Design execution cancelled",
            ),
          },
        };
        return;
      }

      if (runResult.exhausted) {
        yield {
          type: "error",
          data: {
            error: `重规划次数耗尽（已重规划 ${runResult.replanCount}/${planHard.maxReplans} 次）`,
            taskId: failedResult?.taskId,
            errorClass: "permanent",
            replanExhausted: true,
            replanCount: runResult.replanCount,
          },
        };
        return;
      }

      if (failedResult) {
        yield {
          type: "error",
          data: {
            error: failedResult.errorMessage ?? `Task ${failedResult.taskId} failed`,
            taskId: failedResult.taskId,
            errorClass: failedResult.errorClass,
            replanCount: runResult.replanCount,
          },
        };
        return;
      }

      const completedCount = results.filter((r) => r.status === "success").length;

      // Structured integration: field registry + conflict detection.
      const integration = await this.integrateAndPersist(results, sessionId);

      const fileList = results
        .filter((r) => r.status === "success")
        .map((r) => {
          const dirName = this.deps.workspace
            ? this.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
            : r.taskId;
          return `- ${dirName}/output.md`;
        })
        .join("\n");

      const conflictNote = integration.conflictCount > 0
        ? `\n\n⚠️ 检测到 **${integration.conflictCount}** 处字段冲突，详见 \`final/冲突报告.md\`。`
        : "";

      const summary = `## ✅ 策划方案已生成\n\n共完成 **${completedCount}** 个子任务，所有产出已保存到工作空间：\n\n${fileList || "- （无成功产出）"}${conflictNote}\n\n---\n\n📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  \n📦 也可以直接点击「打包下载全部」获取 ZIP。`;

      yield { type: "integrate", data: { message: "汇总完成，产出已保存到工作空间", conflictCount: integration.conflictCount } };
      yield { type: "complete", data: { success: true, output: summary } };
    } catch (err) {
      if (isToolHitlRequiredError(err)) {
        for (const event of eventBus.drain()) {
          yield event;
        }
        yield this.toolHitlStreamEvent(err);
        return;
      }
      yield {
        type: "error",
        data: {
          error: err instanceof Error ? err.message : String(err),
          phase: "design",
        },
      };
    }
  }

  private async executeSingleRoleFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    signal?: AbortSignal,
    options?: DirectorStreamOptions,
  ): Promise<AgentResponse> {
    const { RoleAgentMap, parseRole } = await import("../../schema/Role.js");
    const typedRole = parseRole(role);
    const agentName = RoleAgentMap[typedRole];
    const descriptor = this.skillCtx.getAgentDescriptor(agentName, options);

    if (!descriptor) {
      return {
        agentName: "Director",
        message: ChatMessage.text("assistant", "Director", `未找到角色 ${role} 对应的 Agent`),
        metadata: {},
        success: false,
        errorMessage: `No agent descriptor found for role: ${role}`,
      };
    }

    if (this.deps.workspace) {
      await this.deps.workspace.initialize(sessionId);
    }

    const skill = this.skillCtx.skillRegistry(options).matchSkill(requirement, role);
    this.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);

    // Inject full skill content into descriptor, not just the name in assignment
    const enrichedDescriptor = skill
      ? this.planResolver.augmentDescriptorWithSkill(descriptor, requirement, options)
      : descriptor;
    const assignment = skill
      ? `【参考技能: ${skill.getName()}】\n\n${requirement}`
      : requirement;

    const result = await this.executeSingleTask(
      {
        taskId: "single",
        domain: "system_design",
        assignment,
        agentDescriptor: enrichedDescriptor,
        dependencies: [],
      },
      sessionId,
      traceId,
      undefined,
      signal,
      options,
    );

    return {
      agentName: descriptor.name,
      message: ChatMessage.text("assistant", descriptor.name, result.output),
      metadata: {},
      success: result.status === "success",
      errorMessage: result.errorMessage,
    };
  }

  private async *executeSingleRoleStream(
    requirement: string,
    sessionId: string,
    role: string,
    signal?: AbortSignal,
    options?: DirectorStreamOptions,
  ): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "design", role } };

    const eventBus = new EventBus();
    const streamEmitterHook = new StreamEmitterHook(eventBus, {
      grepLimit: this.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.deps.limits?.webSourceResultLimit,
    });

    try {
      if (this.deps.workspace) {
        await this.deps.workspace.initialize(sessionId);
      }

      const { RoleAgentMap, parseRole } = await import("../../schema/Role.js");
      const typedRole = parseRole(role);
      const agentName = RoleAgentMap[typedRole];
      const descriptor = this.skillCtx.getAgentDescriptor(agentName, options);

      if (!descriptor) {
        yield { type: "error", data: { error: `未找到角色 ${role} 对应的 Agent` } };
        return;
      }

      yield { type: "plan", data: { message: `直接执行 ${descriptor.name} 任务` } };
      yield { type: "route", data: { message: `分配给 ${descriptor.name}` } };

      const skill = this.skillCtx.skillRegistry(options).matchSkill(requirement, role);
      this.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
      yield { type: "skill_matched", data: { skillName: skill?.getName() ?? null, role } };

      // Inject full skill content into descriptor
      const enrichedDescriptor = skill
        ? this.planResolver.augmentDescriptorWithSkill(descriptor, requirement, options)
        : descriptor;
      const assignment = skill
        ? `【参考技能: ${skill.getName()}】\n\n${requirement}`
        : requirement;

      const domainMap: Record<string, import("../../schema/TaskPlan.js").Domain> = {
        system_designer: "system_design",
        combat_designer: "combat_design",
        numerical_planner: "numerical_planning",
        gameplay_designer: "gameplay_design",
        executive_planner: "executive_planning",
        qa_planner: "qa",
        chief_designer: "system_design",
      };
      const singleDomain = domainMap[role] ?? "system_design";

      yield {
        type: "task_start",
        data: { taskId: "single", domain: role, description: assignment },
      };

      const done = { value: false };
      const taskPromise = this.executeSingleTask(
        {
          taskId: "single",
          domain: singleDomain,
          assignment,
          agentDescriptor: enrichedDescriptor,
          dependencies: [],
        },
        sessionId,
        undefined,
        streamEmitterHook,
        signal,
        options,
      ).finally(() => { done.value = true; });

      for await (const event of this.concurrentDrain(eventBus, done)) {
        yield event;
      }
      const result = await taskPromise;

      // Final drain for events emitted between the last check and completion
      for (const event of eventBus.drain()) {
        yield event;
      }

      yield { type: "task_complete", data: { taskId: "single", status: result.status } };

      if (result.status !== "success") {
        yield { type: "error", data: { error: result.errorMessage ?? "执行失败" } };
        return;
      }

      yield { type: "complete", data: { success: true, output: result.output } };
    } catch (err) {
      for (const event of eventBus.drain()) {
        yield event;
      }
      if (isToolHitlRequiredError(err)) {
        yield this.toolHitlStreamEvent(err);
        return;
      }
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private toolHitlStreamEvent(err: ToolHitlRequiredError): StreamEvent {
    return {
      type: "hitl",
      data: {
        checkpointId: err.checkpointId,
        reviewPoint: "hitl-tool-irreversible",
        status: "waiting_review",
        toolName: err.toolName,
        argsHash: err.argsHash,
      },
    };
  }

  private async executeTableFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    options?: DirectorStreamOptions,
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role, traceId, options);
  }
}
