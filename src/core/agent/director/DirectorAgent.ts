import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { AgentResponse as AR } from "../../../port/agent/AgentResponse.js";
import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { ModelResponse } from "../../../port/model/ModelResponse.js";
import type { AgentFactory } from "../../../port/agent/AgentFactory.js";
import type { ToolRegistry } from "../../../port/tool/ToolRegistry.js";
import type { SkillRegistry } from "../../../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "./HumanReviewGateway.js";
import type { AgentHook } from "../../../port/hook/AgentHook.js";
import { TaskPlanner } from "./TaskPlanner.js";
import { Router } from "./Router.js";
import { Integrator } from "./Integrator.js";
import { PlanPipeline } from "../../pipeline/PlanPipeline.js";
import type { TaskAssignment } from "../../schema/TaskAssignment.js";
import type { TaskResult } from "../../schema/TaskResult.js";
import { getSubAgentDescriptor } from "../subagents/SubAgentFactory.js";

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
    this.querySystemPrompt = deps.prompts?.querySystem ?? "你是游戏策划知识库助手。";
  }

  async execute(
    requirement: string,
    sessionId: string,
    mode: "design" | "query" | "table",
    role: string
  ): Promise<AgentResponse> {
    switch (mode) {
      case "design":
        return this.executeDesignFlow(requirement, sessionId, role);
      case "query":
        return this.executeQueryFlow(requirement, sessionId);
      case "table":
        return this.executeTableFlow(requirement, sessionId, role);
    }
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
    role: string
  ): Promise<AgentResponse> {
    const skill = this.deps.skillRegistry.matchSkill(requirement, role);
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

    const pipeline = new PlanPipeline(
      mergedPlan,
      (task) => this.executeSingleTask(
        {
          taskId: task.id,
          domain: task.domain,
          assignment: task.description,
          agentDescriptor: assignments.find((a) => a.taskId === task.id)?.agentDescriptor ?? getSubAgentDescriptor("SystemDesigner")!,
        },
        sessionId
      )
    );
    const results = await pipeline.execute();

    const reviewedResults = await this.deps.humanReviewGateway.requestReview(
      sessionId, "hitl-2-agent-output", results
    );

    const finalOutput = this.integrator.integrate(reviewedResults.modifications ?? results);

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
    sessionId: string
  ): Promise<TaskResult> {
    const { InMemoryMemoryPort } = await import("../../memory/InMemoryMemoryPort.js");
    const agent = this.deps.agentFactory.createAgent(
      task.agentDescriptor,
      this.deps.toolRegistry,
      new InMemoryMemoryPort(),
      this.deps.hooks
    );

    const input = ChatMessage.text("user", "director", task.assignment);
    const response = await agent.process(sessionId, [input]);

    return {
      taskId: task.taskId,
      domain: task.domain,
      status: response.success ? "success" : "error",
      output: AR.getTextContent(response) ?? "",
      errorMessage: response.errorMessage,
    };
  }

  private async executeQueryFlow(requirement: string, _sessionId: string): Promise<AgentResponse> {
    const response = await this.deps.model.generate([
      ChatMessage.text("system", "system", this.querySystemPrompt),
      ChatMessage.text("user", "user", requirement),
    ]);
    return {
      agentName: "Director",
      message: response.message,
      metadata: {},
      success: true,
      errorMessage: null,
    };
  }

  private async *executeQueryStream(requirement: string, sessionId: string): AsyncIterable<StreamEvent> {
    yield { type: "start", data: { sessionId, mode: "query" } };
    try {
      const stream = this.deps.model.stream([
        ChatMessage.text("system", "system", this.querySystemPrompt),
        ChatMessage.text("user", "user", requirement),
      ]);
      for await (const chunk of stream) {
        const text = ChatMessage.textContent(chunk.message) ?? "";
        if (text) {
          yield { type: "chunk", data: { text } };
        }
      }
      yield { type: "complete", data: { success: true } };
    } catch (err) {
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
    role: string
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role);
  }
}
