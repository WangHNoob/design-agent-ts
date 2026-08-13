import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import { MockModelAdapter } from "../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentFactory } from "../../src/adapter/mock/MockAgentFactory.js";
import { SkillManager } from "../../src/core/skill/SkillManager.js";
import { ChatMessage } from "../../src/port/message/ChatMessage.js";
import type { HumanReviewGateway, ReviewResult } from "../../src/core/agent/director/HumanReviewGateway.js";

/**
 * 可编程 HITL gateway：指定 reviewPoint 的前 N 次请求返回 pending（带 checkpointId），
 * 之后返回 approved。其余 reviewPoint 一律 approved。
 */
class SequenceHitlGateway implements HumanReviewGateway {
  private counts = new Map<string, number>();

  constructor(
    private readonly pendingPoints: Record<string, number>,
  ) {}

  isEnabled(): boolean {
    return true;
  }

  isReviewPointEnabled(_point: string): boolean {
    return true;
  }

  getMaxRevisionRounds(): number {
    return 3;
  }

  async requestReview<T>(
    _sessionId: string,
    point: string,
    content: T,
  ): Promise<ReviewResult<T>> {
    const n = (this.counts.get(point) ?? 0) + 1;
    this.counts.set(point, n);
    const pendingTotal = this.pendingPoints[point] ?? 0;
    if (n <= pendingTotal) {
      return { decision: "pending", checkpointId: `cp-${point}-${n}` };
    }
    return { decision: "approved", modifications: content };
  }
}

function buildDirector(hitl: HumanReviewGateway, model: MockModelAdapter): DirectorAgent {
  const toolRegistry = { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() };
  return new DirectorAgent({
    model,
    agentFactory: new MockAgentFactory(),
    toolRegistry,
    skillRegistry: new SkillManager(),
    humanReviewGateway: hitl,
    hooks: [],
  });
}

function designModel(): MockModelAdapter {
  return new MockModelAdapter([
    ChatMessage.text("assistant", "mock", JSON.stringify({
      planId: "plan-1",
      subTasks: [
        { id: "T1", fragmentId: "F1", domain: "system_design", description: "设计核心系统", dependencies: [], priority: 1 },
      ],
    })),
    ChatMessage.text("assistant", "mock", JSON.stringify([
      { fragmentId: "F1", domain: "system_design", agentName: "SystemDesigner", assignment: "设计核心系统", priority: 1 },
    ])),
  ]);
}

describe("Integration: HITL Flow", () => {
  it("HITL 拒绝时应返回 rejected 状态", async () => {
    const model = designModel();
    // 用 reject 型 gateway：hitl-1 直接驳回
    const rejectGateway = {
      isEnabled: () => true,
      isReviewPointEnabled: () => true,
      getMaxRevisionRounds: () => 3,
      requestReview: async <T,>(): Promise<ReviewResult<T>> =>
        ({ decision: "rejected", feedback: "Mock rejection" }),
    } satisfies HumanReviewGateway;
    const director = buildDirector(rejectGateway, model);

    const response = await director.execute("测试 HITL", "session-1", "design", "chief_designer");
    expect(response.success).toBe(false);
    expect(response.errorMessage).toBe("Mock rejection");
    expect(response.metadata?.rejected).toBe(true);
  });

  it("HITL-2 pending 应中断等待人工审阅，resume 后批准并完成", async () => {
    const hitl = new SequenceHitlGateway({ "hitl-2-agent-output": 1 });
    const director = buildDirector(hitl, designModel());

    const first = await director.execute("设计核心系统", "session-1", "design", "chief_designer");
    expect(first.success).toBe(true);
    expect(first.metadata?.waitingHitl).toBe(true);
    expect(first.metadata?.reviewPoint).toBe("hitl-2-agent-output");
    expect(first.metadata?.taskId).toBe("F1");
    expect(first.metadata?.checkpointId).toBe("cp-hitl-2-agent-output-1");

    // resume：任务重跑 → hitl-2 第二次请求 → approved → 完成
    const second = await director.execute("设计核心系统", "session-1", "design", "chief_designer");
    expect(second.success).toBe(true);
    expect(second.metadata?.waitingHitl).toBeUndefined();
    expect(second.metadata?.fileCount).toBe(1);
  });

  it("HITL-3 pending 应中断终稿验收，resume 后批准并完成", async () => {
    const hitl = new SequenceHitlGateway({ "hitl-3-final": 1 });
    const director = buildDirector(hitl, designModel());

    const first = await director.execute("设计核心系统", "session-1", "design", "chief_designer");
    expect(first.success).toBe(true);
    expect(first.metadata?.waitingHitl).toBe(true);
    expect(first.metadata?.reviewPoint).toBe("hitl-3-final");
    expect(first.metadata?.resumeCursor).toBe("after_integrate");

    const second = await director.execute("设计核心系统", "session-1", "design", "chief_designer");
    expect(second.success).toBe(true);
    expect(second.metadata?.waitingHitl).toBeUndefined();
  });

  it("HITL-2 rejected 应把任务标记为错误并在流式路径发出 error", async () => {
    const rejectOnTask = {
      isEnabled: () => true,
      isReviewPointEnabled: () => true,
      getMaxRevisionRounds: () => 3,
      requestReview: async <T,>(_s: string, point: string, content: T): Promise<ReviewResult<T>> => {
        if (point === "hitl-2-agent-output") {
          return { decision: "rejected", feedback: "产出不合格" };
        }
        return { decision: "approved", modifications: content };
      },
    } satisfies HumanReviewGateway;
    const director = new DirectorAgent({
      model: designModel(),
      agentFactory: new MockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: new SkillManager(),
      humanReviewGateway: rejectOnTask,
      hooks: [],
      planHard: { enabled: false, maxReplans: 0, rejectUnauthorizedTools: true, domainToolDefaults: {} },
    });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    for await (const event of director.executeStream("设计核心系统", "session-1", "design", "chief_designer")) {
      events.push(event as { type: string; data: Record<string, unknown> });
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data.error).toBe("产出不合格");
  });

  it("HITL-2 pending 的流式路径应发出 hitl 事件（Worker pauseForHitl 契约）", async () => {
    const hitl = new SequenceHitlGateway({ "hitl-2-agent-output": 1 });
    const director = buildDirector(hitl, designModel());

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    for await (const event of director.executeStream("设计核心系统", "session-1", "design", "chief_designer")) {
      events.push(event as { type: string; data: Record<string, unknown> });
    }

    const hitlEvent = events.find((e) => e.type === "hitl");
    expect(hitlEvent).toBeDefined();
    expect(hitlEvent!.data.reviewPoint).toBe("hitl-2-agent-output");
    expect(hitlEvent!.data.checkpointId).toBe("cp-hitl-2-agent-output-1");
    expect(hitlEvent!.data.resumeCursor).toBe("after_task:F1");
    expect(hitlEvent!.data.status).toBe("waiting_review");
  });
});
