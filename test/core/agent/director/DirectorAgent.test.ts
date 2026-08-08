import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../../../src/core/agent/director/DirectorAgent.js";
import type { ChatModelPort } from "../../../../src/port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../../src/port/agent/AgentFactory.js";

import type { SkillRegistry } from "../../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../../src/core/agent/director/HumanReviewGateway.js";
import { ChatMessage } from "../../../../src/port/message/ChatMessage.js";

const createMockModel = (): ChatModelPort => ({
  generate: vi.fn().mockResolvedValue({
    message: ChatMessage.text("assistant", "bot", JSON.stringify({ planId: "p1", subTasks: [] })),
    inputTokenCount: 10,
    outputTokenCount: 20,
    finishReason: "stop",
  }),
  stream: vi.fn().mockImplementation(async function* () {
    yield {
      message: ChatMessage.text("assistant", "bot", "chunk"),
      inputTokenCount: 0,
      outputTokenCount: 0,
      finishReason: null,
    };
  }),
  getModelName: vi.fn().mockReturnValue("mock-model"),
  getProvider: vi.fn().mockReturnValue("mock"),
});

const createMockAgentFactory = (): AgentFactory => ({
  createAgent: vi.fn().mockReturnValue({
    getDescriptor: vi.fn(),
    getName: vi.fn().mockReturnValue("MockAgent"),
    process: vi.fn().mockResolvedValue({
      agentName: "MockAgent",
      message: ChatMessage.text("assistant", "MockAgent", "Done"),
      metadata: {},
      success: true,
      errorMessage: null,
    }),
  }),
});

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

const createMockWorkspace = () => ({
  initialize: vi.fn(),
  registerTaskDir: vi.fn(),
  writeTaskOutput: vi.fn(),
  readTaskOutput: vi.fn(),
  listTaskFiles: vi.fn(),
  listTasks: vi.fn(),
  listTaskFilesByPath: vi.fn(),
  resolveTaskDirName: vi.fn((sid: string, taskId: string) => taskId),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  listFiles: vi.fn(),
  readWorkspaceFile: vi.fn(),
});

describe("DirectorAgent", () => {
  it("query 模式应直接返回模型响应", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute("Hello", "sid-1", "query", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("design 模式应执行完整流程", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      workspace: createMockWorkspace(),
    });

    const response = await director.execute("设计战斗系统", "sid-1", "design", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("table 模式应路由到 design 流程", async () => {
    const model = createMockModel();
    const director = new DirectorAgent({
      model,
      agentFactory: createMockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      workspace: createMockWorkspace(),
    });

    const response = await director.execute("生成配表", "sid-1", "table", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("query stream 在无 onTextDelta 时仍按 processStream 响应转发 chunk", async () => {
    const process = vi.fn();
    const processStream = vi.fn(async function* () {
      for (const text of ["真实", "分块"]) {
        yield {
          agentName: "QueryAgent",
          message: ChatMessage.text("assistant", "QueryAgent", text),
          metadata: {},
          success: true,
          errorMessage: null,
        };
      }
    });
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: {
        createAgent: vi.fn(() => ({
          getDescriptor: vi.fn(),
          getName: vi.fn(() => "QueryAgent"),
          process,
          processStream,
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const events = [];
    for await (const event of director.executeStream("Hello", "sid-stream", "query", "chief_designer")) {
      events.push(event);
    }

    expect(events.filter((event) => event.type === "chunk").map((event) => event.data.text))
      .toEqual(["真实", "分块"]);
    expect(events.at(-1)?.data.output).toBe("分块");
    expect(process).not.toHaveBeenCalled();
  });

  it("query stream 应通过 onTextDelta 转发 token 级 chunk", async () => {
    const processStream = vi.fn(async function* (
      _sessionId: string,
      _messages: unknown,
      opts?: { onTextDelta?: (delta: string) => void; streamingEnabled?: boolean },
    ) {
      opts?.onTextDelta?.("Hello");
      opts?.onTextDelta?.(" World");
      yield {
        agentName: "QueryAgent",
        message: ChatMessage.text("assistant", "QueryAgent", "Hello World"),
        metadata: {},
        success: true,
        errorMessage: null,
      };
    });
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: {
        createAgent: vi.fn(() => ({
          getDescriptor: vi.fn(),
          getName: vi.fn(() => "QueryAgent"),
          process: vi.fn(),
          processStream,
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      streamingEnabled: true,
    });

    const events = [];
    for await (const event of director.executeStream("Hello", "sid-delta", "query", "chief_designer")) {
      events.push(event);
    }

    expect(processStream).toHaveBeenCalledWith(
      "sid-delta",
      expect.any(Array),
      expect.objectContaining({
        streamingEnabled: true,
        onTextDelta: expect.any(Function),
      }),
    );
    expect(events.filter((event) => event.type === "chunk").map((event) => event.data.text))
      .toEqual(["Hello", " World"]);
    expect(events.at(-1)?.data.output).toBe("Hello World");
  });

  it("streamingEnabled=false 时不调用 onTextDelta 且仅在最终 yield 完整 chunk", async () => {
    const processStream = vi.fn(async function* (
      _sessionId: string,
      _messages: unknown,
      opts?: { onTextDelta?: (delta: string) => void; streamingEnabled?: boolean },
    ) {
      expect(opts?.streamingEnabled).toBe(false);
      expect(opts?.onTextDelta).toBeTypeOf("function");
      // 模拟 adapter：streamingEnabled=false 时不触发 delta
      yield {
        agentName: "QueryAgent",
        message: ChatMessage.text("assistant", "QueryAgent", "完整答案"),
        metadata: {},
        success: true,
        errorMessage: null,
      };
    });
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: {
        createAgent: vi.fn(() => ({
          getDescriptor: vi.fn(),
          getName: vi.fn(() => "QueryAgent"),
          process: vi.fn(),
          processStream,
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      streamingEnabled: false,
    });

    const events = [];
    for await (const event of director.executeStream("Hello", "sid-no-stream", "query", "chief_designer")) {
      events.push(event);
    }

    expect(processStream).toHaveBeenCalledWith(
      "sid-no-stream",
      expect.any(Array),
      expect.objectContaining({
        streamingEnabled: false,
        onTextDelta: expect.any(Function),
      }),
    );
    expect(events.filter((event) => event.type === "chunk").map((event) => event.data.text))
      .toEqual(["完整答案"]);
    expect(events.at(-1)?.data.output).toBe("完整答案");
  });

  it("design stream 应按 DAG 并发同层并将失败后继标记 skipped", async () => {
    const plan = {
      planId: "p-dag",
      subTasks: [
        { id: "A", fragmentId: "A", domain: "system_design", description: "A", dependencies: [], priority: 1 },
        { id: "B", fragmentId: "B", domain: "combat_design", description: "B", dependencies: [], priority: 1 },
        { id: "C", fragmentId: "C", domain: "qa", description: "C", dependencies: ["A"], priority: 1 },
      ],
    };
    const routing = [
      { fragmentId: "A", domain: "system_design", agentName: "SystemDesigner", assignment: "A", priority: 1 },
      { fragmentId: "B", domain: "combat_design", agentName: "CombatDesigner", assignment: "B", priority: 1 },
      { fragmentId: "C", domain: "qa", agentName: "QAPlanner", assignment: "C", priority: 1 },
    ];
    let generateCall = 0;
    const model = createMockModel();
    model.generate = vi.fn(async () => ({
      message: ChatMessage.text(
        "assistant",
        "bot",
        JSON.stringify(generateCall++ === 0 ? plan : routing),
      ),
      inputTokenCount: 0,
      outputTokenCount: 0,
      finishReason: "stop",
    }));
    let active = 0;
    let maxActive = 0;
    const process = vi.fn(async function (this: { name: string }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      const failed = this.name === "SystemDesigner";
      return {
        agentName: this.name,
        message: ChatMessage.text("assistant", this.name, failed ? "" : "ok"),
        metadata: {},
        success: !failed,
        errorMessage: failed ? "A failed" : null,
      };
    });
    const director = new DirectorAgent({
      model,
      agentFactory: {
        createAgent: vi.fn((descriptor) => ({
          name: descriptor.name,
          getDescriptor: vi.fn(() => descriptor),
          getName: vi.fn(() => descriptor.name),
          process,
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
      // 本用例验证 DAG skip 语义；关闭重规划以免失败任务触发 Replanner
      planHard: {
        enabled: true,
        maxReplans: 0,
        rejectUnauthorizedTools: true,
        domainToolDefaults: {},
      },
    });

    const events = [];
    for await (const event of director.executeStream("DAG", "sid-dag", "design", "chief_designer")) {
      events.push(event);
    }
    const completed = events.filter((event) => event.type === "task_complete");

    expect(maxActive).toBe(2);
    expect(completed).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ taskId: "A", status: "error" }) }),
      expect.objectContaining({ data: expect.objectContaining({ taskId: "B", status: "success" }) }),
      expect.objectContaining({ data: expect.objectContaining({ taskId: "C", status: "skipped" }) }),
    ]));
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("signal aborted 时应标记 cancelled 并保留 partial output", async () => {
    const controller = new AbortController();
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: {
        createAgent: vi.fn((descriptor) => ({
          getDescriptor: vi.fn(() => descriptor),
          getName: vi.fn(() => descriptor.name),
          process: vi.fn(async () => {
            controller.abort(new DOMException("cancelled", "AbortError"));
            return {
              agentName: descriptor.name,
              message: ChatMessage.text("assistant", descriptor.name, "partial work"),
              metadata: {},
              success: true,
              errorMessage: null,
            };
          }),
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute(
      "设计系统",
      "sid-cancel",
      "design",
      "system_designer",
      undefined,
      { signal: controller.signal },
    );

    expect(response.success).toBe(false);
    expect(ChatMessage.textContent(response.message)).toContain("partial work");
  });

  it("metadata.aborted 时应标记 cancelled 即使 agent 返回 success", async () => {
    const director = new DirectorAgent({
      model: createMockModel(),
      agentFactory: {
        createAgent: vi.fn((descriptor) => ({
          getDescriptor: vi.fn(() => descriptor),
          getName: vi.fn(() => descriptor.name),
          process: vi.fn().mockResolvedValue({
            agentName: descriptor.name,
            message: ChatMessage.text("assistant", descriptor.name, "aborted partial"),
            metadata: { aborted: true },
            success: false,
            errorMessage: "Aborted by user",
          }),
        })),
      },
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn(), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: createMockSkillRegistry(),
      humanReviewGateway: createMockHITL(),
      hooks: [],
    });

    const response = await director.execute(
      "设计系统",
      "sid-aborted-meta",
      "design",
      "system_designer",
    );

    expect(response.success).toBe(false);
    expect(ChatMessage.textContent(response.message)).toContain("aborted partial");
  });
});
