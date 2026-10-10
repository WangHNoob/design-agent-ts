import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../../src/port/agent/AgentFactory.js";
import type { SkillRegistry } from "../../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../../src/core/agent/director/HumanReviewGateway.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";
import type { DirectorDeps, DirectorStreamOptions } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { TaskPlan } from "../../../../src/core/schema/TaskPlan.js";

const PLAN_JSON = JSON.stringify({
  planId: "p1",
  subTasks: [
    { id: "F1", fragmentId: "F1", domain: "system_design", description: "做点设计", dependencies: [], priority: 1 },
  ],
});

function createMockModel(streamChunks: string[] = ["你好", "！"]): ChatModelPort {
  return {
    generate: vi.fn().mockResolvedValue({
      message: ChatMessage.text("assistant", "bot", PLAN_JSON),
      inputTokenCount: 10,
      outputTokenCount: 5,
      finishReason: "stop",
    }),
    stream: vi.fn().mockImplementation(async function* () {
      for (const text of streamChunks) {
        yield {
          message: ChatMessage.text("assistant", "bot", text),
          inputTokenCount: 0,
          outputTokenCount: 0,
          finishReason: null,
        };
      }
    }),
    getModelName: vi.fn().mockReturnValue("mock-model"),
    getProvider: vi.fn().mockReturnValue("mock"),
  };
}

const createMockSkillRegistry = (): SkillRegistry => ({
  register: vi.fn(),
  matchSkill: vi.fn().mockReturnValue(null),
  getAll: vi.fn().mockReturnValue([]),
});

const createMockHITL = (): HumanReviewGateway => ({
  isEnabled: vi.fn().mockReturnValue(false),
  isReviewPointEnabled: vi.fn().mockReturnValue(false),
  requestReview: vi.fn().mockResolvedValue({ decision: "approved" }),
  getMaxRevisionRounds: vi.fn().mockReturnValue(3),
});

function createDirector(
  chatFastPath?: DirectorDeps["chatFastPath"],
  model?: ChatModelPort,
) {
  const processStream = vi.fn(async function* () {
    yield {
      agentName: "QueryAgent",
      message: ChatMessage.text("assistant", "QueryAgent", "LLM answer"),
      metadata: {},
      success: true,
      errorMessage: null,
    };
  });
  const agentFactory = {
    createAgent: vi.fn(() => ({
      getDescriptor: vi.fn(),
      getName: vi.fn(() => "QueryAgent"),
      process: vi.fn(),
      processStream,
    })),
  } as unknown as AgentFactory;
  const director = new DirectorAgent({
    model: model ?? createMockModel(),
    agentFactory,
    toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
    skillRegistry: createMockSkillRegistry(),
    humanReviewGateway: createMockHITL(),
    hooks: [],
    chatFastPath,
  });
  return { director, agentFactory, processStream };
}

async function collect(events: AsyncIterable<{ type: string; data: Record<string, unknown> }>) {
  const out: Array<{ type: string; data: Record<string, unknown> }> = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("DirectorAgent design/table 闲聊快路径", () => {
  it("chat 短路：design 模式直接直答，无 plan/无 HITL", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: true, classify }, createMockModel(["你好", "，我是助手"]));
    const history = [{ role: "user" as const, content: "你好" }];

    const events = await collect(director.executeStream("你能做什么", "sid-chat-1", "design", "chief_designer", history));

    expect(classify).toHaveBeenCalledWith("你能做什么", history, "design");
    expect(events.map((e) => e.type)).toEqual(["start", "chunk", "chunk", "complete"]);
    expect(events[0]?.data.directChat).toBe(true);
    expect(events[2]?.data).toEqual({ text: "，我是助手" });
    expect(events[3]?.data).toEqual({ success: true, output: "你好，我是助手", directChat: true });
  });

  it("table 模式同样短路", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("谢谢啦", "sid-chat-2", "table", "chief_designer"));

    expect(events.at(-1)?.type).toBe("complete");
    expect(events.at(-1)?.data.directChat).toBe(true);
  });

  it("task 判定 → 走原规划流程，无 directChat complete", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const { director } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("设计一个背包系统", "sid-task-1", "design", "chief_designer"));

    expect(classify).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "plan")).toBe(true);
    const complete = events.find((e) => e.type === "complete");
    expect(complete?.data.directChat).toBeUndefined();
  });

  it("classify 抛错 → 静默回退原流程", async () => {
    const classify = vi.fn().mockRejectedValue(new Error("llm down"));
    const { director } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("设计一个背包系统", "sid-task-2", "design", "chief_designer"));

    expect(classify).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === "plan")).toBe(true);
    expect(events.some((e) => e.type === "complete" && e.data.directChat === true)).toBe(false);
  });

  it("disabled → 完全跳过分类", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: false, classify });

    const events = await collect(director.executeStream("你好", "sid-off-1", "design", "chief_designer"));

    expect(classify).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "plan")).toBe(true);
  });

  it("HITL 续跑（resumePlan）跳过分类", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: true, classify });
    const resumePlan = {
      planId: "p1",
      requirement: "设计背包系统",
      subTasks: [{ id: "F1", fragmentId: "F1", domain: "system_design" as const, description: "d", dependencies: [], priority: 1 }],
    } satisfies TaskPlan;
    const options: DirectorStreamOptions = { resumePlan };

    const events = await collect(director.executeStream("设计背包系统", "sid-resume-1", "design", "chief_designer", undefined, options));

    expect(classify).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "plan" && e.data.resumed === true)).toBe(true);
  });

  it("initialTaskResults 存在同样跳过分类", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const directorWithResults = new DirectorAgent({
      model: createMockModel(),
      agentFactory: { createAgent: vi.fn() } as unknown as AgentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      chatFastPath: { enabled: true, classify },
    });
    const plan = {
      planId: "p1",
      requirement: "r",
      subTasks: [{ id: "F1", fragmentId: "F1", domain: "system_design" as const, description: "d", dependencies: [], priority: 1 }],
    } satisfies TaskPlan;

    await collect(directorWithResults.executeStream("r", "sid-resume-2", "design", "chief_designer", undefined, {
      resumePlan: plan,
      initialTaskResults: [],
    }));

    expect(classify).not.toHaveBeenCalled();
  });

  it("query 模式 chat 意图 → 直答（不再进查询 agent）", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director, agentFactory, processStream } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("你好", "sid-q-chat-1", "query", "chief_designer"));

    expect(classify).toHaveBeenCalledWith("你好", undefined, "query");
    expect((agentFactory.createAgent as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(processStream).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("complete");
    expect(events.at(-1)?.data.directChat).toBe(true);
  });

  it("design 模式 query 意图（本游戏数据问答）→ 跨模式路由到知识查询管道", async () => {
    const classify = vi.fn().mockResolvedValue("query");
    const { director, agentFactory, processStream } = createDirector({ enabled: true, classify });

    const events = await collect(
      director.executeStream("我们游戏各卡池的5星概率是多少", "sid-cross-1", "design", "chief_designer"),
    );

    expect(classify).toHaveBeenCalledTimes(1);
    expect((agentFactory.createAgent as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    expect(processStream).toHaveBeenCalled();
    expect(events.some((e) => e.type === "plan")).toBe(false);
    expect(events.at(-1)?.type).toBe("complete");
    expect(events.at(-1)?.data.output).toBe("LLM answer");
  });

  it("query 模式 task 意图 → 跨模式路由进规划管道", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const { director, processStream } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("帮我设计一个公会战玩法", "sid-q-task-1", "query", "chief_designer"));

    expect(processStream).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "plan")).toBe(true);
  });

  it("query 模式 unknown（分类失败）→ 模式默认查询管道兜底", async () => {
    const classify = vi.fn().mockRejectedValue(new Error("llm down"));
    const { director, processStream } = createDirector({ enabled: true, classify });

    const events = await collect(director.executeStream("随便什么", "sid-q-err-1", "query", "chief_designer"));

    expect(processStream).toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("complete");
  });

  it("modeHint 透传：分类器拿到用户显式选择的模式", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const { director } = createDirector({ enabled: true, classify });

    await collect(director.executeStream("设计一个背包系统", "sid-hint-1", "table", "chief_designer"));

    expect(classify).toHaveBeenCalledWith("设计一个背包系统", undefined, "table");
  });

  it("流式输出为空 → error 事件（而非空 complete）", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: true, classify }, createMockModel([]));

    const events = await collect(director.executeStream("你好", "sid-chat-3", "design", "chief_designer"));

    expect(events.at(-1)?.type).toBe("error");
  });

  it("非流式 execute：chat 直答返回 directChat 元数据", async () => {
    const classify = vi.fn().mockResolvedValue("chat");
    const { director } = createDirector({ enabled: true, classify });

    const response = await director.execute("你能做什么", "sid-ns-1", "design", "chief_designer", [], undefined);

    expect(response.metadata.directChat).toBe(true);
    expect(response.success).toBe(true);
  });

  it("非流式 execute：task 判定走原流程", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const { director } = createDirector({ enabled: true, classify });

    const response = await director.execute("设计一个背包系统", "sid-ns-2", "design", "chief_designer", [], undefined);

    expect(response.metadata.directChat).toBeUndefined();
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("拒答伪计划兜底：分类判 task + planner 拒答式计划 → 直答，不冻 HITL 卡", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const hitl = createMockHITL();
    const refusalPlanJson = JSON.stringify({
      planId: "auto",
      subTasks: [
        {
          id: "F1",
          fragmentId: "F1",
          domain: "qa",
          description: "用户输入「你是谁」不属于游戏设计需求，无法拆解为有效的游戏策划子任务。请用户提供具体的游戏设计需求后重新规划。",
          dependencies: [],
          priority: 1,
        },
      ],
    });
    const director = new DirectorAgent({
      model: {
        generate: vi.fn().mockResolvedValue({
          message: ChatMessage.text("assistant", "bot", refusalPlanJson),
          inputTokenCount: 10,
          outputTokenCount: 5,
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield {
            message: ChatMessage.text("assistant", "bot", "我是游戏策划工作台的助手，"),
          };
          yield {
            message: ChatMessage.text("assistant", "bot", "请直接描述你想做的设计需求。"),
          };
        }),
        getModelName: () => "mock-model",
        getProvider: () => "mock",
      },
      agentFactory: { createAgent: vi.fn() } as unknown as AgentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: hitl,
      hooks: [],
      chatFastPath: { enabled: true, classify },
      prompts: { directChat: "直答提示词" },
    });

    const events = await collect(
      director.executeStream("你是谁", "sid-refusal-1", "design", "chief_designer"),
    );

    // planner 已被调用（伪计划已生成），但不进 HITL，改走直答
    expect(classify).toHaveBeenCalledTimes(1);
    expect((hitl.requestReview as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "hitl")).toBe(false);
    expect(events.at(-1)?.type).toBe("complete");
    expect(events.at(-1)?.data.directChat).toBe(true);
    expect(events.at(-1)?.data.output).toBe("我是游戏策划工作台的助手，请直接描述你想做的设计需求。");
  });

  it("parseFallback 伪计划兜底：规划解析失败 + 需求是显性闲聊 → 直答", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const hitl = createMockHITL();
    const director = new DirectorAgent({
      // planner LLM 输出非 JSON → parseFallback 单任务伪计划（description=原文"你是谁"）
      model: {
        generate: vi.fn().mockResolvedValue({
          message: ChatMessage.text("assistant", "bot", "这个问题我无法按 JSON 回答"),
          inputTokenCount: 10,
          outputTokenCount: 5,
          finishReason: "stop",
        }),
        stream: vi.fn().mockImplementation(async function* () {
          yield { message: ChatMessage.text("assistant", "bot", "我是平台助手，请描述你想做的设计。") };
        }),
        getModelName: () => "mock-model",
        getProvider: () => "mock",
      },
      agentFactory: { createAgent: vi.fn() } as unknown as AgentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: hitl,
      hooks: [],
      chatFastPath: { enabled: true, classify },
      prompts: { directChat: "直答提示词" },
    });

    const events = await collect(director.executeStream("你是谁", "sid-refusal-2", "design", "chief_designer"));

    expect((hitl.requestReview as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === "hitl")).toBe(false);
    expect(events.at(-1)?.type).toBe("complete");
    expect(events.at(-1)?.data.directChat).toBe(true);
  });

  it("parseFallback 但需求是真实任务 → 照走 HITL（不被静态兜底误吞）", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const hitl = createMockHITL();
    const director = new DirectorAgent({
      model: {
        generate: vi.fn().mockResolvedValue({
          message: ChatMessage.text("assistant", "bot", "无法解析的输出"),
          inputTokenCount: 10,
          outputTokenCount: 5,
          finishReason: "stop",
        }),
        stream: vi.fn(),
        getModelName: () => "mock-model",
        getProvider: () => "mock",
      },
      agentFactory: { createAgent: vi.fn() } as unknown as AgentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: hitl,
      hooks: [],
      chatFastPath: { enabled: true, classify },
    });

    await collect(director.executeStream("设计一个背包系统", "sid-normal-2", "design", "chief_designer"));

    expect((hitl.requestReview as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });

  it("正常单任务计划不触发拒答兜底（照走 HITL）", async () => {
    const classify = vi.fn().mockResolvedValue("task");
    const hitl = createMockHITL();
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: { createAgent: vi.fn() } as unknown as AgentFactory,
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: hitl,
      hooks: [],
      chatFastPath: { enabled: true, classify },
    });

    await collect(director.executeStream("帮我设计一个背包系统", "sid-normal-1", "design", "chief_designer"));

    expect((hitl.requestReview as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
