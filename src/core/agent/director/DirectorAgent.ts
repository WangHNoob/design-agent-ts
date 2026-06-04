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
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import { getSubAgentDescriptor } from "../subagents/SubAgentFactory.js";
import { EventBus } from "./EventBus.js";
import { StreamEmitterHook } from "../../hook/StreamEmitterHook.js";
import { SessionToolRegistry } from "../../tool/SessionToolRegistry.js";
import { WorkspaceReadTool } from "../../tool/workspace/WorkspaceReadTool.js";
import { WorkspaceListTool } from "../../tool/workspace/WorkspaceListTool.js";

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
    | "thinking" | "tool_start" | "tool_complete" | "knowledge_used" | "skill_matched";
  data: Record<string, unknown>;
}

export interface DirectorStreamOptions {
  /** AbortSignal to cancel the execution. When aborted, all LLM calls stop and the stream ends gracefully. */
  signal?: AbortSignal;
}

export interface KnowledgeSource {
  type: "wiki_page" | "kg_node" | "grep_match" | "web_result";
  id: string;
  title?: string;
  relevance?: string;
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
          result = await this.executeDesignFlow(requirement, sessionId, role, undefined, options?.signal);
          break;
        case "query":
          result = await this.executeQueryFlow(requirement, sessionId, undefined, history, options?.signal);
          break;
        case "table":
          result = await this.executeTableFlow(requirement, sessionId, role, undefined, options?.signal);
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
        yield* this.executeDesignStream(requirement, sessionId, role, signal);
        break;
    }
  }

  private async executeDesignFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string,
    signal?: AbortSignal
  ): Promise<AgentResponse> {
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
      sessionId, "hitl-1-task-plan", plan
    );

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
      (task) => this.executeSingleTask(
        {
          taskId: task.id,
          domain: task.domain,
          assignment: task.description,
          agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
          dependencies: task.dependencies,
        },
        sessionId,
        traceId,
        signal
      ),
      signal
    );
    const results = await pipeline.execute();

    const completedCount = results.filter((r) => r.status === "success").length;

    const fileList = results
      .filter((r) => r.status === "success")
      .map((r) => {
        const dirName = this.deps.workspace
          ? this.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
          : r.taskId;
        return `- ${dirName}/output.md`;
      })
      .join("\n");

    const summary = `## ✅ 策划方案已生成\n\n共完成 **${completedCount}** 个子任务，所有产出已保存到工作空间：\n\n${fileList || "- （无成功产出）"}\n\n---\n\n📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  \n📦 也可以直接点击「打包下载全部」获取 ZIP。`;

    return {
      agentName: "Director",
      message: ChatMessage.text("assistant", "Director", summary),
      metadata: { fileCount: completedCount },
      success: true,
      errorMessage: null,
    };
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
      const toolRegistry = this.buildSessionToolRegistry(sessionId);

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

      const toolRegistry = this.buildSessionToolRegistry(sessionId);

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
      };
    } catch (err) {
      throw err;
    }
  }

  private buildSessionToolRegistry(sessionId: string): ToolRegistry {
    if (!this.deps.workspace) {
      return this.deps.toolRegistry;
    }
    const wsReadTool = new WorkspaceReadTool(this.deps.workspace, sessionId);
    const wsListTool = new WorkspaceListTool(this.deps.workspace, sessionId);
    return new SessionToolRegistry(this.deps.toolRegistry, [wsReadTool, wsListTool]);
  }

  private async injectPredecessorContext(task: TaskAssignment, sessionId: string): Promise<string> {
    if (!this.deps.workspace || !task.dependencies || task.dependencies.length === 0) {
      return task.assignment;
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
      return task.assignment;
    }

    return `${task.assignment}\n\n---\n## 前驱任务产出（摘要）\n\n${sections.join("\n\n")}\n\n> 如需完整内容，使用 workspace_read(task_id="<TASK_ID>", file_name="output.md")`;
  }

  private async createQueryAgent() {
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: this.querySystemPrompt,
      maxIterations: this.deps.limits?.queryAgentMaxIterations ?? 10,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
      ],
      options: {},
    };
    const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
    return this.deps.agentFactory.createAgent(
      queryDescriptor,
      this.deps.toolRegistry,
      new InMemoryMemoryPort(),
      this.deps.hooks
    );
  }

  private async createQueryAgentWithHooks(hooks: AgentHook[]) {
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: this.querySystemPrompt,
      maxIterations: this.deps.limits?.queryAgentMaxIterations ?? 10,
      toolNames: [
        "wiki_lookup", "wiki_read", "wiki_list",
        "grep_search",
        "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
        "tavily_search", "tavily_extract",
      ],
      options: {},
    };
    const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
    return this.deps.agentFactory.createAgent(
      queryDescriptor,
      this.deps.toolRegistry,
      new InMemoryMemoryPort(),
      hooks
    );
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
    const agent = await this.createQueryAgent();

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
      const agent = await this.createQueryAgentWithHooks(hooksWithEmitter);

      const messages: import("../../../port/message/ChatMessage.js").ChatMessage[] = [];
      if (history?.length) {
        for (const h of history) {
          messages.push(ChatMessage.text(h.role === "user" ? "user" : "assistant", h.role, h.content));
        }
      }
      messages.push(ChatMessage.text("user", "user", requirement));

      let finalOutput = "";

      // Run agent.process() with concurrent event drain so SSE clients
      // receive thinking/tool events in real-time instead of after completion.
      const done = { value: false };
      const processPromise = agent.process(sessionId, messages, signal ? { signal } : undefined).finally(() => { done.value = true; });

      for await (const event of this.concurrentDrain(eventBus, done)) {
        yield event;
      }
      const response = await processPromise;

      // Final drain for any events emitted between the last check and completion
      for (const event of eventBus.drain()) {
        yield event;
      }

      if (!response.success) {
        yield { type: "error", data: { error: response.errorMessage ?? "Agent execution failed" } };
        return;
      }

      finalOutput = response.message ? ChatMessage.textContent(response.message) : "";

      // Simulate streaming by yielding chunks
      const chunkSize = 20;
      for (let i = 0; i < finalOutput.length; i += chunkSize) {
        yield { type: "chunk", data: { text: finalOutput.substring(i, i + chunkSize) } };
      }

      yield { type: "complete", data: { success: true, output: finalOutput } };
    } catch (err) {
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async *executeDesignStream(requirement: string, sessionId: string, role: string, signal?: AbortSignal): AsyncIterable<StreamEvent> {
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
      yield { type: "plan", data: { message: "Planning tasks...", matchedSkill: skill?.getName() ?? null } };
      const plan = await this.taskPlanner.plan(requirement, role, skill);
      yield { type: "plan", data: { message: `Planned ${plan.subTasks.length} tasks`, plan, matchedSkill: skill?.getName() ?? null } };

      const reviewedPlan = await this.deps.humanReviewGateway.requestReview(
        sessionId, "hitl-1-task-plan", plan
      );

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

      const results: TaskResult[] = [];
      for (const task of mergedPlan.subTasks) {
        // Check abort between sub-tasks
        if (signal?.aborted) {
          console.log(`[DirectorAgent] Stream aborted, skipping remaining tasks`);
          yield { type: "error", data: { error: "任务已被取消" } };
          return;
        }

        yield { type: "task_start", data: { taskId: task.id, domain: task.domain, description: task.description } };

        // Run task with concurrent event drain for real-time SSE progress
        const done = { value: false };
        const taskPromise = this.executeSingleTaskWithHooks(
          {
            taskId: task.id,
            domain: task.domain,
            assignment: task.description,
            agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
            dependencies: task.dependencies,
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

        results.push(result);
        yield { type: "task_complete", data: { taskId: task.id, status: result.status } };
      }

      const completedCount = results.filter((r) => r.status === "success").length;
      const fileList = results
        .filter((r) => r.status === "success")
        .map((r) => {
          const dirName = this.deps.workspace
            ? this.deps.workspace.resolveTaskDirName(sessionId, r.taskId)
            : r.taskId;
          return `- ${dirName}/output.md`;
        })
        .join("\n");

      const summary = `## ✅ 策划方案已生成\n\n共完成 **${completedCount}** 个子任务，所有产出已保存到工作空间：\n\n${fileList || "- （无成功产出）"}\n\n---\n\n📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  \n📦 也可以直接点击「打包下载全部」获取 ZIP。`;

      yield { type: "integrate", data: { message: "汇总完成，产出已保存到工作空间" } };
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
    signal?: AbortSignal
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role, traceId, signal);
  }
}
