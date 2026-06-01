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
import { TaskPlanner } from "./TaskPlanner.js";
import { Router } from "./Router.js";
import { Integrator } from "./Integrator.js";
import { PlanPipeline } from "../../pipeline/PlanPipeline.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import { getSubAgentDescriptor } from "../subagents/SubAgentFactory.js";
import { runInContext } from "../../o11y/O11yContext.js";
import { startSpan, endSpan, failSpan, createTrace } from "../../o11y/O11yTraceBridge.js";
import { status as runtimeStatus } from "../../o11y/O11yRuntimeBridge.js";

function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface StreamEvent {
  type: "start" | "plan" | "route" | "task_start" | "task_complete" | "integrate" | "chunk" | "complete" | "error";
  data: Record<string, unknown>;
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
    role: string
  ): Promise<AgentResponse> {
    const traceId = this.deps.idGenerator?.randomUUID() ?? fallbackUUID();
    const trace = await createTrace({
      id: traceId,
      session_id: sessionId,
      name: `DirectorAgent.${mode}`,
      status: "running",
    });

    const rootCtx = { traceId, spanId: traceId, sessionId };

    return runInContext(rootCtx, async () => {
      const rootSpan = startSpan("DirectorAgent.execute", "DIRECTOR", rootCtx, {
        mode,
        role,
        requirementPreview: requirement.substring(0, 100),
      });

      runtimeStatus(sessionId, traceId, "PLANNING", 0, `Starting ${mode} execution`, role, null);

      try {
        let result: AgentResponse;
        switch (mode) {
          case "design":
            result = await this.executeDesignFlow(requirement, sessionId, role, traceId);
            break;
          case "query":
            result = await this.executeQueryFlow(requirement, sessionId, traceId);
            break;
          case "table":
            result = await this.executeTableFlow(requirement, sessionId, role, traceId);
            break;
        }
        endSpan(rootSpan, { resultLength: result.message?.content?.length ?? 0 });
        runtimeStatus(sessionId, traceId, "COMPLETE", 100, "Execution completed", null, null);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failSpan(rootSpan, msg);
        runtimeStatus(sessionId, traceId, "COMPLETE", 100, `Execution failed: ${msg}`, null, null);
        throw err;
      }
    });
  }

  async *executeStream(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string
  ): AsyncIterable<StreamEvent> {
    switch (mode) {
      case "query":
        yield* this.executeQueryStream(requirement, sessionId);
        break;
      case "design":
      case "table":
        yield* this.executeDesignStream(requirement, sessionId, role);
        break;
    }
  }

  private async executeDesignFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string
  ): Promise<AgentResponse> {
    const planSpan = startSpan("TaskPlanner.plan", "TASK_PLANNER", null, { requirementPreview: requirement.substring(0, 100) });
    const skill = this.deps.skillRegistry.matchSkill(requirement, role);
    const plan = await this.taskPlanner.plan(requirement, role, skill);
    endSpan(planSpan, { subTaskCount: plan.subTasks.length });

    runtimeStatus(sessionId, traceId ?? "unknown", "PIPELINE", 20, `${plan.subTasks.length} sub-tasks planned`, null, null);

    const reviewedPlan = await this.deps.humanReviewGateway.requestReview(
      sessionId, "hitl-1-task-plan", plan
    );

    const routeSpan = startSpan("Router.route", "ROUTER", null);
    const routing = await this.router.route(reviewedPlan.modifications ?? plan, role);
    endSpan(routeSpan, { decisionCount: routing.length });

    runtimeStatus(sessionId, traceId ?? "unknown", "PIPELINE", 40, `Routed to ${routing.length} agents`, null, null);

    // Map RouteDecision[] to TaskAssignment[]
    const assignments: TaskAssignment[] = routing
      .map((decision): TaskAssignment | null => {
        const descriptor = getSubAgentDescriptor(decision.agentName);
        if (!descriptor) {
          console.warn(`[DirectorAgent] Unknown agent: ${decision.agentName}`);
          return null;
        }
        return {
          taskId: decision.fragmentId,
          domain: decision.domain,
          assignment: decision.assignment,
          agentDescriptor: descriptor,
        };
      })
      .filter((a): a is TaskAssignment => a !== null);

    // Merge assignments back into plan subTasks so PlanPipeline can execute them
    const mergedPlan = {
      planId: plan.planId,
      requirement,
      subTasks: assignments.map((a) => ({
        id: a.taskId,
        fragmentId: a.taskId,
        domain: a.domain,
        description: a.assignment,
        dependencies: [],
        priority: 1,
      })),
    };

    const pipelineSpan = startSpan("PlanPipeline.execute", "PIPELINE", null, { taskCount: mergedPlan.subTasks.length });
    const pipeline = new PlanPipeline(
      mergedPlan,
      (task) => this.executeSingleTask(
        {
          taskId: task.id,
          domain: task.domain,
          assignment: task.description,
          agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
        },
        sessionId,
        traceId
      )
    );
    const results = await pipeline.execute();
    endSpan(pipelineSpan, { resultCount: results.length });

    runtimeStatus(sessionId, traceId ?? "unknown", "AGENT", 60, `Executed ${results.length} sub-tasks`, null, null);

    const reviewedResults = await this.deps.humanReviewGateway.requestReview(
      sessionId, "hitl-2-agent-output", results
    );

    const integrateSpan = startSpan("Integrator.integrate", "INTEGRATOR", null);
    const finalOutput = this.integrator.integrate(reviewedResults.modifications ?? results);
    endSpan(integrateSpan, { outputLength: finalOutput.length });

    runtimeStatus(sessionId, traceId ?? "unknown", "INTEGRATING", 80, "Integrating results", null, null);

    const finalReviewed = await this.deps.humanReviewGateway.requestReview(
      sessionId, "hitl-3-final", finalOutput
    );

    return {
      agentName: "Director",
      message: ChatMessage.text("assistant", "Director", finalReviewed.modifications ?? finalOutput),
      metadata: {},
      success: true,
      errorMessage: null,
    };
  }

  private async executeSingleTask(
    task: TaskAssignment,
    sessionId: string,
    traceId?: string
  ): Promise<TaskResult> {
    const taskSpan = startSpan(task.agentDescriptor.name, "SUB_AGENT", null, {
      taskId: task.taskId,
      domain: task.domain,
    });
    try {
      const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
      const agent = this.deps.agentFactory.createAgent(
        task.agentDescriptor,
        this.deps.toolRegistry,
        new InMemoryMemoryPort(),
        this.deps.hooks
      );

      const input = ChatMessage.text("user", "director", task.assignment);
      const response = await agent.process(sessionId, [input]);

      endSpan(taskSpan, { success: response.success });
      return {
        taskId: task.taskId,
        domain: task.domain,
        status: response.success ? "success" : "error",
        output: AR.getTextContent(response) ?? "",
        errorMessage: response.errorMessage,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failSpan(taskSpan, msg);
      throw err;
    }
  }

  private async createQueryAgent() {
    const queryDescriptor: AgentDescriptor = {
      name: "QueryAgent",
      systemPrompt: this.querySystemPrompt,
      maxIterations: 5,
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

  private async executeQueryFlow(requirement: string, sessionId: string, traceId?: string): Promise<AgentResponse> {
    runtimeStatus(sessionId, traceId ?? "unknown", "LLM", 50, "Executing query with tools", null, null);
    const agent = await this.createQueryAgent();
    const response = await agent.process(sessionId, [
      ChatMessage.text("user", "user", requirement),
    ]);
    return {
      agentName: "Director",
      message: response.message,
      metadata: {},
      success: response.success,
      errorMessage: response.errorMessage,
    };
  }

  private async *executeQueryStream(requirement: string, sessionId: string): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "query" } };

    const traceId = this.deps.idGenerator?.randomUUID() ?? fallbackUUID();
    runtimeStatus(sessionId, traceId, "LLM", 10, "Preparing query agent", "QueryAgent", null);

    try {
      const agent = await this.createQueryAgent();
      const messages = [ChatMessage.text("user", "user", requirement)];

      runtimeStatus(sessionId, traceId, "LLM", 30, "Executing query with tools", "QueryAgent", null);

      let finalOutput = "";

      if (agent.processStream) {
        for await (const chunk of agent.processStream(sessionId, messages)) {
          if (!chunk.success) {
            runtimeStatus(sessionId, traceId, "COMPLETE", 100, "Query failed", "QueryAgent", null);
            yield { type: "error", data: { error: chunk.errorMessage ?? "Agent execution failed" } };
            return;
          }
          const text = chunk.message ? ChatMessage.textContent(chunk.message) : "";
          if (text) {
            finalOutput = text;
            yield { type: "chunk", data: { text } };
          }
        }
      } else {
        const response = await agent.process(sessionId, messages);
        if (!response.success) {
          runtimeStatus(sessionId, traceId, "COMPLETE", 100, "Query failed", "QueryAgent", null);
          yield { type: "error", data: { error: response.errorMessage ?? "Agent execution failed" } };
          return;
        }
        finalOutput = response.message ? ChatMessage.textContent(response.message) : "";
        const chunkSize = 20;
        for (let i = 0; i < finalOutput.length; i += chunkSize) {
          yield { type: "chunk", data: { text: finalOutput.substring(i, i + chunkSize) } };
        }
      }

      runtimeStatus(sessionId, traceId, "COMPLETE", 100, "Query completed", "QueryAgent", null);
      yield { type: "complete", data: { success: true, output: finalOutput } };
    } catch (err) {
      runtimeStatus(sessionId, traceId, "COMPLETE", 100, `Query error: ${err instanceof Error ? err.message : String(err)}`, "QueryAgent", null);
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async *executeDesignStream(requirement: string, sessionId: string, role: string): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "design", role } };
    try {
      yield { type: "plan", data: { message: "Planning tasks..." } };
      const skill = this.deps.skillRegistry.matchSkill(requirement, role);
      const plan = await this.taskPlanner.plan(requirement, role, skill);
      yield { type: "plan", data: { message: `Planned ${plan.subTasks.length} tasks`, plan } };

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
          return {
            taskId: decision.fragmentId,
            domain: decision.domain,
            assignment: decision.assignment,
            agentDescriptor: descriptor,
          };
        })
        .filter((a): a is TaskAssignment => a !== null);

      const mergedPlan = {
        planId: plan.planId,
        requirement,
        subTasks: assignments.map((a) => ({
          id: a.taskId,
          fragmentId: a.taskId,
          domain: a.domain,
          description: a.assignment,
          dependencies: [],
          priority: 1,
        })),
      };

      const results: TaskResult[] = [];
      for (const task of mergedPlan.subTasks) {
        yield { type: "task_start", data: { taskId: task.id, domain: task.domain, description: task.description } };
        const result = await this.executeSingleTask(
          {
            taskId: task.id,
            domain: task.domain,
            assignment: task.description,
            agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
          },
          sessionId
        );
        results.push(result);
        yield { type: "task_complete", data: { taskId: task.id, status: result.status } };
      }

      yield { type: "integrate", data: { message: "Integrating results..." } };
      const reviewedResults = await this.deps.humanReviewGateway.requestReview(
        sessionId, "hitl-2-agent-output", results
      );
      const finalOutput = this.integrator.integrate(reviewedResults.modifications ?? results);
      const finalReviewed = await this.deps.humanReviewGateway.requestReview(
        sessionId, "hitl-3-final", finalOutput
      );

      const output = finalReviewed.modifications ?? finalOutput;
      yield { type: "complete", data: { success: true, output } };
    } catch (err) {
      yield { type: "error", data: { error: err instanceof Error ? err.message : String(err) } };
    }
  }

  private async executeTableFlow(
    requirement: string,
    sessionId: string,
    role: string,
    traceId?: string
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role, traceId);
  }
}
