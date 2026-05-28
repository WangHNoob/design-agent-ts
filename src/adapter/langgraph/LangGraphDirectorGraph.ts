import {
  StateGraph,
  Annotation,
  START,
  END,
  type MemorySaver,
  interrupt,
} from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { AgentFactory } from "../../port/agent/AgentFactory.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../core/agent/director/HumanReviewGateway.js";
import { LangGraphMessageMapper } from "./LangGraphMessageMapper.js";
import type { LangGraphModelAdapter } from "./LangGraphModelAdapter.js";

const DirectorState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (x, y) => x.concat(y) }),
  sessionId: Annotation<string>({ value: (_x, y) => y }),
  mode: Annotation<"design" | "query" | "table">({ value: (_x, y) => y }),
  role: Annotation<string>({ value: (_x, y) => y }),
  requirement: Annotation<string>({ value: (_x, y) => y }),
  taskPlan: Annotation<Record<string, unknown> | null>({ value: (_x, y) => y, default: () => null }),
  routeDecisions: Annotation<Record<string, unknown>[]>({ value: (_x, y) => y, default: () => [] }),
  subResults: Annotation<Record<string, unknown>[]>({ value: (_x, y) => y, default: () => [] }),
  finalOutput: Annotation<string>({ value: (_x, y) => y, default: () => "" }),
  iteration: Annotation<number>({ value: (_x, y) => y, default: () => 0 }),
});

export class LangGraphDirectorGraph {
  private messageMapper = new LangGraphMessageMapper();

  buildGraph(deps: {
    model: LangGraphModelAdapter;
    agentFactory: AgentFactory;
    toolRegistry: ToolRegistry;
    skillRegistry: SkillRegistry;
    humanReviewGateway: HumanReviewGateway;
    hooks: AgentHook[];
    checkpointer?: MemorySaver;
  }): unknown {
    const lcModel = deps.model.getLangChainModel();

    const workflow = new StateGraph(DirectorState)

      .addNode("intentRecognition", async (state) => {
        const _response = await lcModel.invoke([
          new SystemMessage({ content: "你是意图识别器，分析用户需求并确定执行策略。" }),
          ...state.messages,
        ]);
        return { messages: [_response] };
      })

      .addNode("skillMatch", async (state) => {
        const skill = deps.skillRegistry.matchSkill(state.requirement, state.role);
        return { taskPlan: { skill: skill?.getName() ?? null } as Record<string, unknown> };
      })

      .addNode("taskPlanning", async (state) => {
        await lcModel.invoke([
          new SystemMessage({ content: "你是任务规划器，将需求拆解为子任务。" }),
          new HumanMessage({ content: state.requirement }),
        ]);
        return { taskPlan: { planId: "auto", subTasks: [] } as Record<string, unknown> };
      })

      .addNode("hitl1Review", async (state) => {
        if (!deps.humanReviewGateway.isReviewPointEnabled("hitl-1-task-plan")) {
          return {};
        }
        const review = interrupt({
          question: "任务计划需要审阅",
          taskPlan: state.taskPlan,
        });
        return { taskPlan: (review as Record<string, unknown>)?.taskPlan ?? state.taskPlan };
      })

      .addNode("routing", async (_state) => {
        return { routeDecisions: [] as Record<string, unknown>[] };
      })

      .addNode("executeSubAgents", async (_state) => {
        return { subResults: [] as Record<string, unknown>[] };
      })

      .addNode("hitl2Review", async (state) => {
        if (!deps.humanReviewGateway.isReviewPointEnabled("hitl-2-agent-output")) {
          return {};
        }
        const review = interrupt({
          question: "子 Agent 产出需要审阅",
          results: state.subResults,
        });
        return { subResults: (review as Record<string, unknown>)?.results ?? state.subResults };
      })

      .addNode("integration", async (_state) => {
        return { finalOutput: "" };
      })

      .addNode("hitl3Review", async (state) => {
        if (!deps.humanReviewGateway.isReviewPointEnabled("hitl-3-final")) {
          return {};
        }
        const review = interrupt({
          question: "最终产出需要审阅",
          output: state.finalOutput,
        });
        return { finalOutput: (review as Record<string, unknown>)?.output ?? state.finalOutput };
      })

      .addEdge(START, "intentRecognition")
      .addConditionalEdges("intentRecognition", (state) => {
        if (state.mode === "query") return "executeSubAgents";
        if (state.mode === "table") return "taskPlanning";
        return "skillMatch";
      })
      .addEdge("skillMatch", "taskPlanning")
      .addEdge("taskPlanning", "hitl1Review")
      .addEdge("hitl1Review", "routing")
      .addEdge("routing", "executeSubAgents")
      .addEdge("executeSubAgents", "hitl2Review")
      .addEdge("hitl2Review", "integration")
      .addEdge("integration", "hitl3Review")
      .addEdge("hitl3Review", END);

    return workflow.compile({ checkpointer: deps.checkpointer });
  }
}
