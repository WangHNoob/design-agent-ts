import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { AgentResponse as AR } from "../../../port/agent/AgentResponse.js";
import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { ModelResponse } from "../../../port/model/ModelResponse.js";
import type { AgentFactory } from "../../../port/agent/AgentFactory.js";
import type { AgentDescriptor } from "../../../port/agent/AgentDescriptor.js";
import type { ToolRegistry } from "../../../port/tool/ToolRegistry.js";
import type { SkillRegistry } from "../../../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "./HumanReviewGateway.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import type { IdGeneratorPort } from "../../../port/infra/IdGeneratorPort.js";
import type { WorkspaceManager } from "../../workspace/WorkspaceManager.js";
import { TaskPlanner } from "./TaskPlanner.js";
import { Router } from "./Router.js";
import { Integrator } from "./Integrator.js";
import { PlanPipeline } from "../../pipeline/PlanPipeline.js";
import { ErrorClassifier } from "../../execution/ErrorClassifier.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import type { TaskPlan } from "../../schema/TaskPlan.js";
import { getSubAgentDescriptor } from "../subagents/SubAgentFactory.js";
import { EventBus } from "./EventBus.js";
import { StreamEmitterHook } from "../../hook/StreamEmitterHook.js";
import { SessionToolRegistry } from "../../tool/SessionToolRegistry.js";
import { WorkspaceReadTool } from "../../tool/workspace/WorkspaceReadTool.js";
import { WorkspaceListTool } from "../../tool/workspace/WorkspaceListTool.js";
import { DelegatingTool } from "../../tool/DelegatingTool.js";
import { BlackboardTool } from "../../tool/BlackboardTool.js";
import { CachingToolRegistry } from "../../tool/CachingToolRegistry.js";
import type { BlackboardStorePort } from "../../../port/blackboard/BlackboardPort.js";

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Map agent descriptor names to role strings for skill matching. */
const AGENT_NAME_TO_ROLE: Record<string, string> = {
  SystemDesigner: "system_designer",
  CombatDesigner: "combat_designer",
  NumericalPlanner: "numerical_planner",
  GameplayDesigner: "gameplay_designer",
  ExecutivePlanner: "executive_planner",
  QAPlanner: "qa_planner",
};

export interface StreamEvent {
  type: "start" | "plan" | "route" | "task_start" | "task_complete" | "integrate" | "chunk" | "complete" | "error"
    | "thinking" | "tool_start" | "tool_complete" | "knowledge_used" | "skill_matched" | "hitl";
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
    subAgentMaxIterations?: number;
    grepSearchResultLimit?: number;
    webSourceResultLimit?: number;
  };
  /** Extra tool names (e.g. MCP-sourced tools) appended to the query agent's toolset. */
  extraToolNames?: string[];
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
}

export class DirectorAgent {
  private taskPlanner: TaskPlanner;
  private router: Router;
  private integrator: Integrator;
  private querySystemPrompt: string;

  constructor(private deps: DirectorDeps) {
    this.taskPlanner = new TaskPlanner(deps.model, deps.prompts?.taskPlanner);
    this.router = new Router(deps.model, deps.prompts?.router);
    this.integrator = new Integrator();
    this.querySystemPrompt = deps.prompts?.querySystem ?? "";
  }

  async execute(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    options?: DirectorStreamOptions
  ): Promise<AgentResponse> {
    try {
      let result: AgentResponse;
      switch (mode) {
        case "design":
          result = await this.executeDesignFlow(requirement, sessionId, role, undefined, options);
          break;
        case "query":
          result = await this.executeQueryFlow(requirement, sessionId, undefined, history, options?.signal);
          break;
        case "table":
          result = await this.executeTableFlow(requirement, sessionId, role, undefined, options);
          break;
      }
      return result;
    } catch (err) {
      throw err;
    }
  }

  async *executeStream(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    options?: DirectorStreamOptions
  ): AsyncIterable<StreamEvent> {
    const signal = options?.signal;
    switch (mode) {
      case "query":
        yield* this.executeQueryStream(requirement, sessionId, history, signal);
        break;
      case "design":
      case "table":
        yield* this.executeDesignStream(requirement, sessionId, role, options);
        break;
    }
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
      return this.executeSingleRoleFlow(requirement, sessionId, role, traceId, signal);
    }

    if (this.deps.workspace) {
      await this.deps.workspace.initialize(sessionId);
    }

    const skill = this.deps.skillRegistry.matchSkill(requirement, role);
    console.log(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
    const plan = await this.taskPlanner.plan(requirement, role, skill);

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

    const routing = await this.router.route(reviewedPlan.modifications ?? plan, role);

    // Map RouteDecision[] to TaskAssignment[]
    const assignments: TaskAssignment[] = routing
      .map((decision): TaskAssignment | null => {
        const descriptor = getSubAgentDescriptor(decision.agentName);
        if (!descriptor) {
          console.warn(`[DirectorAgent] Unknown agent: ${decision.agentName}`);
          return null;
        }
        const originalSubTask = plan.subTasks.find((st) => st.id === decision.fragmentId || st.fragmentId === decision.fragmentId);
        return {
          taskId: decision.fragmentId,
          domain: decision.domain,
          assignment: decision.assignment,
          agentDescriptor: descriptor,
          dependencies: originalSubTask?.dependencies ?? [],
        };
      })
      .filter((a): a is TaskAssignment => a !== null);

    if (this.deps.workspace) {
      for (const assignment of assignments) {
        this.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
      }
    }

    // Merge assignments back into plan subTasks so PlanPipeline can execute them
    const mergedPlan = {
      planId: plan.planId,
      requirement,
      subTasks: assignments.map((a) => {
        const originalSubTask = plan.subTasks.find((st) => st.id === a.taskId || st.fragmentId === a.taskId);
        return {
          id: a.taskId,
          fragmentId: a.taskId,
          domain: a.domain,
          description: a.assignment,
          dependencies: originalSubTask?.dependencies ?? [],
          priority: originalSubTask?.priority ?? 1,
        };
      }),
    };

    const pipeline = new PlanPipeline(
      mergedPlan,
      (task, taskSignal) => this.executeSingleTask(
        {
          taskId: task.id,
          domain: task.domain,
          assignment: task.description,
          agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
          dependencies: task.dependencies,
        },
        sessionId,
        traceId,
        taskSignal
      ),
      signal
    );
    const results = await pipeline.execute();

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

  /**
   * Match the best agent skill for a task's sub-agent and inject the full
   * skill content into the descriptor's systemPrompt.
   */
  private augmentDescriptorWithSkill(
    descriptor: AgentDescriptor,
    assignment: string,
  ): AgentDescriptor {
    const role = AGENT_NAME_TO_ROLE[descriptor.name];
    if (!role) return descriptor;

    const skill = this.deps.skillRegistry.matchSkill(assignment, role);
    if (!skill) return descriptor;

    const skillContent = skill.getContent();
    if (!skillContent) return descriptor;

    console.log(`[DirectorAgent] Injecting skill "${skill.getName()}" (${skillContent.length} chars) into ${descriptor.name}`);
    return {
      ...descriptor,
      systemPrompt: `${descriptor.systemPrompt}\n\n---\n\n${skillContent}`,
    };
  }

  private async executeSingleTask(
    task: TaskAssignment,
    sessionId: string,
    traceId?: string,
    signal?: AbortSignal
  ): Promise<TaskResult> {
    // Early abort check
    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        domain: task.domain,
        status: "cancelled",
        output: "",
        errorMessage: "Task cancelled by user",
      };
    }

    try {
      const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");

      // Build session-scoped tool registry with workspace tools
      const toolRegistry = this.buildSessionToolRegistry(sessionId, task.agentDescriptor.name);

      // Inject matched skill content into the sub-agent's system prompt
      const descriptor = this.augmentDescriptorWithSkill(task.agentDescriptor, task.assignment);

      const agent = this.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        new InMemoryMemoryPort(),
        this.deps.hooks
      );

      // Inject predecessor context into assignment message
      const enhancedAssignment = await this.injectPredecessorContext(task, sessionId);
      const input = ChatMessage.text("user", "director", enhancedAssignment);
      const response = await agent.process(sessionId, [input], signal ? { signal } : undefined);

      // Write output to workspace
      let output = AR.getTextContent(response) ?? "";
      if (!output.trim()) {
        output = "(子 Agent 返回空内容)";
      }
      if (this.deps.workspace && output) {
        await this.deps.workspace.writeTaskOutput(sessionId, task.taskId, "output.md", output);
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
      };
    } catch (err) {
      throw err;
    }
  }

  private async executeSingleTaskWithHooks(
    task: TaskAssignment,
    sessionId: string,
    traceId?: string,
    additionalHook?: AgentHook,
    signal?: AbortSignal
  ): Promise<TaskResult> {
    // Early abort check
    if (signal?.aborted) {
      return {
        taskId: task.taskId,
        domain: task.domain,
        status: "cancelled",
        output: "",
        errorMessage: "Task cancelled by user",
      };
    }

    try {
      const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
      const hooks = additionalHook ? [...this.deps.hooks, additionalHook] : this.deps.hooks;

      const toolRegistry = this.buildSessionToolRegistry(sessionId, task.agentDescriptor.name);

      // Inject matched skill content into the sub-agent's system prompt
      const descriptor = this.augmentDescriptorWithSkill(task.agentDescriptor, task.assignment);

      const agent = this.deps.agentFactory.createAgent(
        descriptor,
        toolRegistry,
        new InMemoryMemoryPort(),
        hooks
      );

      const enhancedAssignment = await this.injectPredecessorContext(task, sessionId);
      const input = ChatMessage.text("user", "director", enhancedAssignment);
      const response = await agent.process(sessionId, [input], signal ? { signal } : undefined);

      let output = AR.getTextContent(response) ?? "";
      if (!output.trim()) {
        output = "(子 Agent 返回空内容)";
      }
      if (this.deps.workspace && output) {
        await this.deps.workspace.writeTaskOutput(sessionId, task.taskId, "output.md", output);
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
      };
    } catch (err) {
      throw err;
    }
  }

  private buildSessionToolRegistry(sessionId: string, agentType: string): ToolRegistry {
    let registry: ToolRegistry = this.deps.toolRegistry;
    if (this.deps.workspace) {
      const wsReadTool = new WorkspaceReadTool(this.deps.workspace, sessionId);
      const wsListTool = new WorkspaceListTool(this.deps.workspace, sessionId);
      registry = new SessionToolRegistry(registry, [wsReadTool, wsListTool]);
    }
    return this.wrapWithBlackboard(registry, sessionId, agentType);
  }

  /**
   * 为指定会话叠加共享黑板能力：
   * 1) 注入 4 个 session-scoped 的 blackboard_* 工具（绑定该会话黑板）；
   * 2) 对白名单工具套上透明读穿缓存（{@link CachingToolRegistry}）。
   * 黑板禁用时原样返回 base，零侵入。
   */
  private wrapWithBlackboard(base: ToolRegistry, sessionId: string, agentType: string): ToolRegistry {
    const cfg = this.deps.blackboardConfig;
    if (!cfg?.enabled || !this.deps.blackboardStore) {
      return base;
    }
    const bb = this.deps.blackboardStore.getOrCreate(sessionId);

    // 1) session-scoped blackboard_* 工具
    const bbTool = new BlackboardTool(bb, agentType, cfg.defaultTtlSeconds);
    const withBbTools = new SessionToolRegistry(base, [
      new DelegatingTool("blackboard_write", "向团队共享黑板写入一条关键要点。参数: key (string), value (string), ttl_seconds (number, optional)", bbTool, { action: "write" }),
      new DelegatingTool("blackboard_read", "按 key 读取黑板中的要点。参数: key (string)", bbTool, { action: "read" }),
      new DelegatingTool("blackboard_search", "按关键字检索黑板中的要点。参数: keyword (string)", bbTool, { action: "search" }),
      new DelegatingTool("blackboard_recent", "列出黑板中最近写入的要点。参数: limit (number, optional, default 5)", bbTool, { action: "recent" }),
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

  private async injectPredecessorContext(task: TaskAssignment, sessionId: string): Promise<string> {
    const blackboardBlock = this.buildBlackboardContext(sessionId);

    if (!this.deps.workspace || !task.dependencies || task.dependencies.length === 0) {
      return blackboardBlock ? `${task.assignment}${blackboardBlock}` : task.assignment;
    }

    const sections: string[] = [];
    for (const depId of task.dependencies) {
      const files = await this.deps.workspace.listTaskFiles(sessionId, depId);
      if (files.length === 0) continue;

      for (const fileName of files) {
        const content = await this.deps.workspace.readTaskOutput(sessionId, depId, fileName);
        if (!content) continue;
        const truncated = content.length > 2000
          ? content.substring(0, 2000) + "\n...(已截断，使用 workspace_read 读取完整内容)"
          : content;
        sections.push(`### ${depId} / ${fileName}\n${truncated}`);
      }
    }

    if (sections.length === 0) {
      return blackboardBlock ? `${task.assignment}${blackboardBlock}` : task.assignment;
    }

    return `${task.assignment}${blackboardBlock}\n\n---\n## 前驱任务产出（摘要）\n\n${sections.join("\n\n")}\n\n> 如需完整内容，使用 workspace_read(task_id="<TASK_ID>", file_name="output.md")`;
  }

  /**
   * 构造注入子任务的近期黑板要点摘要块。无要点 / 黑板禁用时返回空串。
   * 每条仅取前 80 字，最多 recentInjectCount 条，避免膨胀 prompt。
   */
  private buildBlackboardContext(sessionId: string): string {
    const cfg = this.deps.blackboardConfig;
    if (!cfg?.enabled || !this.deps.blackboardStore) {
      return "";
    }
    const recent = this.deps.blackboardStore.getOrCreate(sessionId).listRecent(cfg.recentInjectCount);
    if (recent.length === 0) {
      return "";
    }
    const lines = recent.map((e) => {
      const preview = e.value.length > 80 ? e.value.slice(0, 80) + "…" : e.value;
      return `- [${e.agentType}] ${e.key}: ${preview}`;
    });
    return `\n\n---\n## 团队共享黑板（近期要点，避免重复搜索）\n\n${lines.join("\n")}\n\n> 可用 blackboard_read/blackboard_search 获取完整内容，或 blackboard_write 记录新要点。`;
  }

  private async createQueryAgent(sessionId: string) {
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: this.querySystemPrompt,
      maxIterations: this.deps.limits?.queryAgentMaxIterations ?? 10,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
        ...this.blackboardToolNames(),
        ...(this.deps.extraToolNames ?? []),
      ],
      options: {},
    };
    const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
    return this.deps.agentFactory.createAgent(
      queryDescriptor,
      this.wrapWithBlackboard(this.deps.toolRegistry, sessionId, "QueryAgent"),
      new InMemoryMemoryPort(),
      this.deps.hooks
    );
  }

  private async createQueryAgentWithHooks(hooks: AgentHook[], sessionId: string) {
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: this.querySystemPrompt,
      maxIterations: this.deps.limits?.queryAgentMaxIterations ?? 10,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
        ...this.blackboardToolNames(),
        ...(this.deps.extraToolNames ?? []),
      ],
      options: {},
    };
    const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
    return this.deps.agentFactory.createAgent(
      queryDescriptor,
      this.wrapWithBlackboard(this.deps.toolRegistry, sessionId, "QueryAgent"),
      new InMemoryMemoryPort(),
      hooks
    );
  }

  /** 黑板启用时返回 4 个 blackboard_* 工具名，供 Agent 描述符引用。 */
  private blackboardToolNames(): string[] {
    if (!this.deps.blackboardConfig?.enabled || !this.deps.blackboardStore) {
      return [];
    }
    return ["blackboard_write", "blackboard_read", "blackboard_search", "blackboard_recent"];
  }

  /**
   * Background event drain generator: yields accumulated EventBus events
   * every 200ms until the `done` flag is set. Designed to run concurrently
   * with blocking agent execution via Promise.all, so the SSE client
   * receives real-time progress events instead of a post-execution dump.
   */
  private async *concurrentDrain(eventBus: EventBus, done: { value: boolean }): AsyncGenerator<StreamEvent> {
    while (!done.value) {
      await new Promise((r) => setTimeout(r, 200));
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
    const agent = await this.createQueryAgent(sessionId);

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
    signal?: AbortSignal
  ): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "query" } };

    // Create EventBus and StreamEmitterHook for fine-grained events
    const eventBus = new EventBus();
    const streamEmitterHook = new StreamEmitterHook(eventBus, {
      grepLimit: this.deps.limits?.grepSearchResultLimit,
      webSourceLimit: this.deps.limits?.webSourceResultLimit,
    });
    const hooksWithEmitter = [...this.deps.hooks, streamEmitterHook];

    try {
      const agent = await this.createQueryAgentWithHooks(hooksWithEmitter, sessionId);

      const messages: import("../../../port/message/ChatMessage.js").ChatMessage[] = [];
      if (history?.length) {
        for (const h of history) {
          messages.push(ChatMessage.text(h.role === "user" ? "user" : "assistant", h.role, h.content));
        }
      }
      messages.push(ChatMessage.text("user", "user", requirement));

      let finalOutput = "";
      if (agent.processStream) {
        for await (const response of agent.processStream(
          sessionId,
          messages,
          signal ? { signal } : undefined,
        )) {
          for (const event of eventBus.drain()) {
            yield event;
          }
          if (!response.success) {
            yield { type: "error", data: { error: response.errorMessage ?? "Agent execution failed" } };
            return;
          }
          const text = response.message ? ChatMessage.textContent(response.message) : "";
          if (text) {
            finalOutput += text;
            yield { type: "chunk", data: { text } };
          }
        }
      } else {
        const response = await agent.process(sessionId, messages, signal ? { signal } : undefined);
        for (const event of eventBus.drain()) {
          yield event;
        }
        if (!response.success) {
          yield { type: "error", data: { error: response.errorMessage ?? "Agent execution failed" } };
          return;
        }
        finalOutput = response.message ? ChatMessage.textContent(response.message) : "";
        if (finalOutput) {
          yield { type: "chunk", data: { text: finalOutput } };
        }
      }

      for (const event of eventBus.drain()) {
        yield event;
      }

      yield { type: "complete", data: { success: true, output: finalOutput } };
    } catch (err) {
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
      yield* this.executeSingleRoleStream(requirement, sessionId, role, signal);
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

      const skill = this.deps.skillRegistry.matchSkill(requirement, role);
      console.log(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
      let plan = options?.resumePlan;
      if (plan) {
        yield { type: "plan", data: { message: `Resuming ${plan.subTasks.length} tasks`, plan, resumed: true } };
      } else {
        yield { type: "plan", data: { message: "Planning tasks...", matchedSkill: skill?.getName() ?? null } };
        plan = await this.taskPlanner.plan(requirement, role, skill);
        yield { type: "plan", data: { message: `Planned ${plan.subTasks.length} tasks`, plan, matchedSkill: skill?.getName() ?? null } };
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
            feedback: reviewedPlan.feedback,
          },
        };
        return;
      }

      if (reviewedPlan.decision === "rejected") {
        yield {
          type: "error",
          data: {
            error: reviewedPlan.feedback ?? "任务计划被驳回",
            errorClass: "permanent",
            rejected: true,
            fallback: reviewedPlan.fallback === true,
          },
        };
        return;
      }

      yield { type: "route", data: { message: "Routing tasks to agents..." } };
      const routing = await this.router.route(reviewedPlan.modifications ?? plan, role);
      yield { type: "route", data: { message: `Routed to ${routing.length} agents`, routing } };

      const assignments: TaskAssignment[] = routing
        .map((decision): TaskAssignment | null => {
          const descriptor = getSubAgentDescriptor(decision.agentName);
          if (!descriptor) return null;
          const originalSubTask = plan.subTasks.find((st) => st.id === decision.fragmentId || st.fragmentId === decision.fragmentId);
          return {
            taskId: decision.fragmentId,
            domain: decision.domain,
            assignment: decision.assignment,
            agentDescriptor: descriptor,
            dependencies: originalSubTask?.dependencies ?? [],
          };
        })
        .filter((a): a is TaskAssignment => a !== null);

      if (this.deps.workspace) {
        for (const assignment of assignments) {
          this.deps.workspace.registerTaskDir(sessionId, assignment.taskId, assignment.domain);
        }
      }

      const mergedPlan: TaskPlan = {
        planId: plan.planId,
        requirement,
        subTasks: assignments.map((a) => {
          const originalSubTask = plan.subTasks.find((st) => st.id === a.taskId || st.fragmentId === a.taskId);
          return {
            id: a.taskId,
            fragmentId: a.taskId,
            domain: a.domain,
            description: a.assignment,
            dependencies: originalSubTask?.dependencies ?? [],
            priority: originalSubTask?.priority ?? 1,
          };
        }),
      };
      yield { type: "plan", data: { message: "Executable plan ready", plan: mergedPlan, executable: true } };

      const pipeline = new PlanPipeline(
        mergedPlan,
        (task, taskSignal) => this.executeSingleTaskWithHooks(
          {
            taskId: task.id,
            domain: task.domain,
            assignment: task.description,
            agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor
              ?? getSubAgentDescriptor("SystemDesigner")!,
            dependencies: task.dependencies,
          },
          sessionId,
          undefined,
          streamEmitterHook,
          taskSignal,
        ),
        {
          signal,
          taskTimeoutMs: options?.taskTimeoutMs,
          initialResults: options?.initialTaskResults,
          onTaskStart: (task) => eventBus.emit({
            type: "task_start",
            data: {
              taskId: task.id,
              domain: task.domain,
              description: task.description,
              agentName: assignments.find((assignment) => assignment.taskId === task.id)
                ?.agentDescriptor.name,
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
      );
      const done = { value: false };
      const pipelinePromise = pipeline.execute().finally(() => { done.value = true; });
      for await (const event of this.concurrentDrain(eventBus, done)) {
        yield event;
      }
      const results = await pipelinePromise;
      for (const event of eventBus.drain()) {
        yield event;
      }

      const failedResult = results.find(
        (result) => result.status === "error" || result.status === "cancelled",
      );
      if (failedResult) {
        yield {
          type: "error",
          data: {
            error: failedResult.errorMessage ?? `Task ${failedResult.taskId} failed`,
            taskId: failedResult.taskId,
            errorClass: failedResult.errorClass,
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
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async executeSingleRoleFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    signal?: AbortSignal
  ): Promise<AgentResponse> {
    const { RoleAgentMap, parseRole } = await import("../../schema/Role.js");
    const typedRole = parseRole(role);
    const agentName = RoleAgentMap[typedRole];
    const descriptor = getSubAgentDescriptor(agentName);

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

    const skill = this.deps.skillRegistry.matchSkill(requirement, role);
    console.log(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);

    // Inject full skill content into descriptor, not just the name in assignment
    const enrichedDescriptor = skill
      ? this.augmentDescriptorWithSkill(descriptor, requirement)
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
      signal
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
    signal?: AbortSignal
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
      const descriptor = getSubAgentDescriptor(agentName);

      if (!descriptor) {
        yield { type: "error", data: { error: `未找到角色 ${role} 对应的 Agent` } };
        return;
      }

      yield { type: "plan", data: { message: `直接执行 ${descriptor.name} 任务` } };
      yield { type: "route", data: { message: `分配给 ${descriptor.name}` } };

      const skill = this.deps.skillRegistry.matchSkill(requirement, role);
      console.log(`[DirectorAgent] Matched skill: ${skill?.getName() ?? "none"} for role=${role}`);
      yield { type: "skill_matched", data: { skillName: skill?.getName() ?? null, role } };

      // Inject full skill content into descriptor
      const enrichedDescriptor = skill
        ? this.augmentDescriptorWithSkill(descriptor, requirement)
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
      const taskPromise = this.executeSingleTaskWithHooks(
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
        signal
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
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
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
