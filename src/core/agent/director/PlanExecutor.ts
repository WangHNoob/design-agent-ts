import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { AgentResponse as AR } from "../../../port/agent/AgentResponse.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import { ErrorClassifier } from "../../execution/ErrorClassifier.js";
import { buildCancellationPayload, isCancellationScenario } from "../../execution/CancellationPayload.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { EventBus } from "./EventBus.js";
import { StreamEmitterHook } from "../../hook/StreamEmitterHook.js";
import { isToolHitlRequiredError, type ToolHitlRequiredError } from "../../tool/ToolHitlRequiredError.js";
import { decideFaqHit } from "../../faq/decideFaqHit.js";
import { PlanReplanner } from "../../plan/PlanReplanner.js";
import { runPlanWithReplan } from "../../plan/runPlanWithReplan.js";
import { AgentCallGuard, AGENT_INVOKE_TOOL_NAME, type CallContext, type HandoffLimits, type HandoffPayload, distillHandoff, isHandoffViolationError, isMultiAgentGuardError, seedHandoffsFromResults, validateHandoff } from "../../multiagent/index.js";
import type { DirectorDeps, DirectorMultiAgentConfig, DirectorPlanHardConfig, DirectorStreamOptions, StreamEvent } from "./DirectorAgent.js";
import type { DirectorContext } from "./DirectorContext.js";
import type { ToolPlanResolver } from "./ToolPlanResolver.js";
import type { Integrator } from "./Integrator.js";

/**
 * PlanExecutor：多智能体策划主执行流（design/query/table 三模式的非流式与
 * 流式执行、任务派发与 HITL 审阅、SSE 事件排空）。
 *
 * 从 DirectorAgent 拆出（纯移动，行为不变）：可变状态（callGuard /
 * activeCallParent / handoffByTask）经 state 访问器与主类同步；
 * 公共入口 execute/executeStream 留在 DirectorAgent（trace 生命周期）。
 */
export interface PlanExecutorCtx {
  deps: DirectorDeps;
  skillCtx: DirectorContext;
  planResolver: ToolPlanResolver;
  integrator: Integrator;
  logger: LoggerPort;
  config: {
    planHard(): DirectorPlanHardConfig;
    multiAgent(): DirectorMultiAgentConfig;
    handoffLimits(): HandoffLimits;
  };
  state: {
    getCallGuard(): AgentCallGuard;
    setCallGuard(guard: AgentCallGuard): void;
    getActiveParent(): CallContext;
    setActiveParent(ctx: CallContext): void;
    getCallRoot(): CallContext;
    setCallRoot(ctx: CallContext): void;
    getHandoffByTask(): Map<string, HandoffPayload>;
  };
}

export class PlanExecutor {
  constructor(private readonly ctx: PlanExecutorCtx) {}
  private async beginMultiAgentRun(initialResults?: readonly TaskResult[]): Promise<void> {
    const multi = this.ctx.config.multiAgent();
    const guard = new AgentCallGuard({
      maxDepth: multi.maxDepth,
      detectCycles: multi.detectCycles,
    });
    this.ctx.state.setCallGuard(guard);
    this.ctx.state.setCallRoot(guard.root("Director"));
    this.ctx.state.setActiveParent(this.ctx.state.getCallRoot());
    this.ctx.state.getHandoffByTask().clear();

    const seeded = seedHandoffsFromResults(
      initialResults ?? [],
      this.ctx.config.handoffLimits(),
      (info) => {
        void this.safeRecordPlanSpan("guard.handoff_violation", { ...info });
      },
    );
    for (const [taskId, handoff] of seeded) {
      this.ctx.state.getHandoffByTask().set(taskId, handoff);
    }
  }
  private buildTaskHandoff(
    task: TaskAssignment,
    output: string,
  ): HandoffPayload | undefined {
    const multi = this.ctx.config.multiAgent();
    if (!multi.enabled) return undefined;
    const limits = this.ctx.config.handoffLimits();
    const handoff = distillHandoff({
      taskId: task.taskId,
      domain: task.domain,
      output,
      artifacts: ["output.md"],
      limits,
    });
    validateHandoff(handoff, limits);
    this.ctx.state.getHandoffByTask().set(task.taskId, handoff);
    return handoff;
  }
  async safeRecordPlanSpan(
    name: string,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.ctx.deps.tracer?.recordSpan({
        name,
        kind: "internal",
        status: name.includes("denied") || name.includes("exhausted") ? "error" : "ok",
        attributes,
      });
    } catch {
      // Trace must never break plan execution.
    }
  }
  async executeDesignFlow(
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

    if (this.ctx.deps.workspace) {
      await this.ctx.deps.workspace.initialize(sessionId);
    }

    await this.beginMultiAgentRun(options?.initialTaskResults);

    const skill = this.ctx.skillCtx.skillRegistry(options).matchSkill(requirement, role);
    this.ctx.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
    const plan = await this.ctx.skillCtx.getTaskPlanner(options).plan(requirement, role, skill);

    const reviewedPlan = await this.ctx.deps.humanReviewGateway.requestReview(
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

    const routing = await this.ctx.skillCtx.getRouter(options).route(reviewedPlan.modifications ?? plan, role);

    const assignments = this.ctx.planResolver.mapRoutingToAssignments(
      reviewedPlan.modifications ?? plan,
      routing,
      options,
    );

    if (this.ctx.deps.workspace) {
      for (const assignment of assignments) {
        this.ctx.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
      }
    }

    const mergedPlan = this.ctx.planResolver.buildMergedExecutablePlan(
      reviewedPlan.modifications ?? plan,
      assignments,
      requirement,
    );

    const planHard = this.ctx.config.planHard();
    const assignmentsById = new Map(assignments.map((a) => [a.taskId, a]));
    const replanner = new PlanReplanner(this.ctx.deps.model, {
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
        const reRoute = await this.ctx.skillCtx.getRouter(options).route(fragment, role);
        for (const a of this.ctx.planResolver.mapRoutingToAssignments(fragment, reRoute, options)) {
          assignmentsById.set(a.taskId, a);
          this.ctx.deps.workspace?.registerTaskDir(sessionId, a.taskId, a.domain);
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
              agentDescriptor: this.ctx.skillCtx.getAgentDescriptor("SystemDesigner", options)!,
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
        maxFanOut: this.ctx.config.multiAgent().enabled ? this.ctx.config.multiAgent().maxFanOut : 0,
        onFanOutBatch: (info) => this.safeRecordPlanSpan("guard.fan_out_batch", { ...info }),
        inFlightPartialOutputTimeoutMs: this.ctx.deps.limits?.inFlightPartialOutputTimeoutMs,
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
        const dirName = this.ctx.deps.workspace
          ? this.ctx.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
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
    const integration = this.ctx.integrator.integrateStructured(results);
    const extraFiles: string[] = [];

    if (this.ctx.deps.workspace) {
      for (const doc of integration.documents) {
        // Only persist synthesized reports here; per-agent outputs are already
        // written to each task dir as output.md during execution.
        if (doc.taskId === "conflicts" || doc.taskId === "field_registry") {
          const fileName = `final/${doc.fileName}.md`;
          await this.ctx.deps.workspace.writeFile(sessionId, fileName, doc.markdownContent);
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

    const multi = this.ctx.config.multiAgent();
    const prevCallParent = this.ctx.state.getActiveParent();
    try {
      const memoryPort = await this.ctx.skillCtx.createMemoryPort();
      const hooks = additionalHook ? [...this.ctx.deps.hooks, additionalHook] : this.ctx.deps.hooks;

      const { descriptor, toolRegistry } = this.ctx.planResolver.prepareTaskAgent(task, sessionId, options);

      const parent = options?.callParent ?? this.ctx.state.getCallRoot();
      if (multi.enabled) {
        this.ctx.state.setActiveParent(this.ctx.state.getCallGuard().enter(descriptor.name, parent));
      } else {
        this.ctx.state.setActiveParent(parent);
      }

      const agent = this.ctx.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        memoryPort,
        hooks
      );

      const enhancedAssignment = await this.ctx.planResolver.injectPredecessorContext(task, sessionId);
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
      if (this.ctx.deps.workspace && output) {
        await this.ctx.deps.workspace.writeTaskOutput(sessionId, task.taskId, "output.md", output);
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
      this.ctx.state.setActiveParent(prevCallParent);
    }
  }
  /**
   * Nested Agent-as-Tool runner. CallContext for `agentName` was already entered
   * by {@link AgentInvokeTool} / invokeSubAgent — do not enter again.
   */
  async runNestedAgentInvoke(input: {
    agentName: string;
    assignment: string;
    callParent: CallContext;
    sessionId: string;
    signal?: AbortSignal;
    options?: DirectorStreamOptions;
  }): Promise<string> {
    const prev = this.ctx.state.getActiveParent();
    this.ctx.state.setActiveParent(input.callParent);
    try {
      const base = this.ctx.skillCtx.getAgentDescriptor(input.agentName, input.options);
      if (!base) {
        throw new Error(`Unknown agent for invoke_agent: ${input.agentName}`);
      }
      const multi = this.ctx.config.multiAgent();
      let descriptor: AgentDescriptor = { ...base };
      if (multi.enabled && multi.allowInvoke) {
        descriptor = {
          ...descriptor,
          toolNames: Array.from(new Set([...descriptor.toolNames, AGENT_INVOKE_TOOL_NAME])),
        };
      }
      const memoryPort = await this.ctx.skillCtx.createMemoryPort();
      const toolRegistry = this.ctx.planResolver.buildSessionToolRegistry(
        input.sessionId,
        input.agentName,
        input.options,
      );
      const agent = this.ctx.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        memoryPort,
        this.ctx.deps.hooks,
      );
      const message = ChatMessage.text("user", "director", input.assignment);
      const response = await agent.process(
        input.sessionId,
        [message],
        input.signal ? { signal: input.signal } : undefined,
      );
      return AR.getTextContent(response) ?? "";
    } finally {
      this.ctx.state.setActiveParent(prev);
    }
  }
  /**
   * Background event drain generator: yields accumulated EventBus events
   * every 200ms until the `done` flag is set. Designed to run concurrently
   * with blocking agent execution via Promise.all, so the SSE client
   * receives real-time progress events instead of a post-execution dump.
   */
  private async *concurrentDrain(eventBus: EventBus, done: { value: boolean }): AsyncGenerator<StreamEvent> {
    const drainIntervalMs = this.ctx.deps.limits?.eventDrainIntervalMs ?? 200;
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
  async executeQueryFlow(
    requirement: string,
    sessionId: string,
    traceId?: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal
  ): Promise<AgentResponse> {
    const agent = await this.ctx.planResolver.createQueryAgent(sessionId);

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
  async *executeQueryStream(
    requirement: string,
    sessionId: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal,
    options?: DirectorStreamOptions,
  ): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "query" } };

    const fp = this.ctx.deps.faqFastPath;
    if (fp?.enabled) {
      try {
        const raw = await fp.match(requirement);
        const decision = decideFaqHit(raw, fp.threshold);
        if (decision.ok) {
          this.ctx.logger.info(`[DirectorAgent] faq.hit score=${decision.score} faqId=${decision.faqId ?? ""}`);
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
        this.ctx.logger.info(`[DirectorAgent] faq.miss reason=${decision.reason}`);
        void this.safeRecordPlanSpan("faq.miss", { reason: decision.reason });
      } catch (err) {
        this.ctx.logger.warn("[DirectorAgent] faq.error", {
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
      grepLimit: this.ctx.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.ctx.deps.limits?.webSourceResultLimit,
    });
    const hooksWithEmitter = [...this.ctx.deps.hooks, streamEmitterHook];

    try {
      const agent = await this.ctx.planResolver.createQueryAgentWithHooks(
        hooksWithEmitter,
        sessionId,
        this.ctx.skillCtx.getQuerySystemPrompt(options),
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
      const streamingEnabled = this.ctx.deps.streamingEnabled !== false;
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
  async *executeDesignStream(
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
      grepLimit: this.ctx.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.ctx.deps.limits?.webSourceResultLimit,
    });

    try {
      if (this.ctx.deps.workspace) {
        await this.ctx.deps.workspace.initialize(sessionId);
      }

      await this.beginMultiAgentRun(options?.initialTaskResults);

      const skill = this.ctx.skillCtx.skillRegistry(options).matchSkill(requirement, role);
      this.ctx.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
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
          plan = await this.ctx.skillCtx.getTaskPlanner(options).plan(requirement, role, skill);
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
        : await this.ctx.deps.humanReviewGateway.requestReview(
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
        routing = await this.ctx.skillCtx.getRouter(options).route(activePlan, role);
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

      const assignments = this.ctx.planResolver.mapRoutingToAssignments(activePlan, routing, options);

      if (this.ctx.deps.workspace) {
        for (const assignment of assignments) {
          this.ctx.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
        }
      }

      const mergedPlan = this.ctx.planResolver.buildMergedExecutablePlan(activePlan, assignments, requirement);
      yield { type: "plan", data: { message: "Executable plan ready", plan: mergedPlan, executable: true } };

      const planHard = this.ctx.config.planHard();
      const assignmentsById = new Map(assignments.map((a) => [a.taskId, a]));
      const replanner = new PlanReplanner(this.ctx.deps.model, {
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
          const reRoute = await this.ctx.skillCtx.getRouter(options).route(fragment, role);
          for (const a of this.ctx.planResolver.mapRoutingToAssignments(fragment, reRoute, options)) {
            assignmentsById.set(a.taskId, a);
            this.ctx.deps.workspace?.registerTaskDir(sessionId, a.taskId, a.domain);
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
                agentDescriptor: this.ctx.skillCtx.getAgentDescriptor("SystemDesigner", options)!,
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
          maxFanOut: this.ctx.config.multiAgent().enabled ? this.ctx.config.multiAgent().maxFanOut : 0,
          onFanOutBatch: (info) => this.safeRecordPlanSpan("guard.fan_out_batch", { ...info }),
          inFlightPartialOutputTimeoutMs: this.ctx.deps.limits?.inFlightPartialOutputTimeoutMs,
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
          const dirName = this.ctx.deps.workspace
            ? this.ctx.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
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
    const descriptor = this.ctx.skillCtx.getAgentDescriptor(agentName, options);

    if (!descriptor) {
      return {
        agentName: "Director",
        message: ChatMessage.text("assistant", "Director", `未找到角色 ${role} 对应的 Agent`),
        metadata: {},
        success: false,
        errorMessage: `No agent descriptor found for role: ${role}`,
      };
    }

    if (this.ctx.deps.workspace) {
      await this.ctx.deps.workspace.initialize(sessionId);
    }

    const skill = this.ctx.skillCtx.skillRegistry(options).matchSkill(requirement, role);
    this.ctx.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);

    // Inject full skill content into descriptor, not just the name in assignment
    const enrichedDescriptor = skill
      ? this.ctx.planResolver.augmentDescriptorWithSkill(descriptor, requirement, options)
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
      grepLimit: this.ctx.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.ctx.deps.limits?.webSourceResultLimit,
    });

    try {
      if (this.ctx.deps.workspace) {
        await this.ctx.deps.workspace.initialize(sessionId);
      }

      const { RoleAgentMap, parseRole } = await import("../../schema/Role.js");
      const typedRole = parseRole(role);
      const agentName = RoleAgentMap[typedRole];
      const descriptor = this.ctx.skillCtx.getAgentDescriptor(agentName, options);

      if (!descriptor) {
        yield { type: "error", data: { error: `未找到角色 ${role} 对应的 Agent` } };
        return;
      }

      yield { type: "plan", data: { message: `直接执行 ${descriptor.name} 任务` } };
      yield { type: "route", data: { message: `分配给 ${descriptor.name}` } };

      const skill = this.ctx.skillCtx.skillRegistry(options).matchSkill(requirement, role);
      this.ctx.logger.info(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
      yield { type: "skill_matched", data: { skillName: skill?.getName() ?? null, role } };

      // Inject full skill content into descriptor
      const enrichedDescriptor = skill
        ? this.ctx.planResolver.augmentDescriptorWithSkill(descriptor, requirement, options)
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
  async executeTableFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    options?: DirectorStreamOptions,
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role, traceId, options);
  }


}
