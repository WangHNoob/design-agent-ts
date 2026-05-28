import type { AgentResponse } from "../../../port/agent/AgentResponse.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { AgentResponse as AR } from "../../../port/agent/AgentResponse.js";
import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
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

export interface DirectorDeps {
  model: ChatModelPort;
  agentFactory: AgentFactory;
  toolRegistry: ToolRegistry;
  skillRegistry: SkillRegistry;
  humanReviewGateway: HumanReviewGateway;
  hooks: AgentHook[];
}

export class DirectorAgent {
  private taskPlanner: TaskPlanner;
  private router: Router;
  private integrator: Integrator;

  constructor(private deps: DirectorDeps) {
    this.taskPlanner = new TaskPlanner(deps.model);
    this.router = new Router(deps.model);
    this.integrator = new Integrator();
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

    await this.router.route(reviewedPlan.modifications ?? plan, role);

    const pipeline = new PlanPipeline(
      { planId: plan.planId, requirement, subTasks: [] },
      (task) => this.executeSingleTask(task as unknown as TaskAssignment, sessionId)
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
    const agent = this.deps.agentFactory.createAgent(
      task.agentDescriptor,
      this.deps.toolRegistry,
      new (await import("../../../adapter/mock/InMemoryMemoryPort.js")).InMemoryMemoryPort(),
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
      ChatMessage.text("system", "system", "你是游戏策划知识库助手。"),
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

  private async executeTableFlow(
    requirement: string,
    sessionId: string,
    role: string
  ): Promise<AgentResponse> {
    return this.executeDesignFlow(requirement, sessionId, role);
  }
}
