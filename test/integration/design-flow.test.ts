import { describe, it, expect, vi } from "vitest";
import { DirectorAgent } from "../../src/core/agent/director/DirectorAgent.js";
import { MockModelAdapter } from "../../src/adapter/mock/MockModelAdapter.js";
import { MockAgentFactory } from "../../src/adapter/mock/MockAgentFactory.js";
import { MockHumanReviewGateway } from "../../src/adapter/mock/MockHumanReviewGateway.js";
import { SkillManager } from "../../src/core/skill/SkillManager.js";
import { ChatMessage } from "../../src/port/message/ChatMessage.js";

describe("Integration: DESIGN Flow", () => {
  it("应执行完整的 design 流程", async () => {
    const model = new MockModelAdapter([
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

    const toolRegistry = { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() };
    const skillRegistry = new SkillManager();
    const hitl = new MockHumanReviewGateway(true);

    const director = new DirectorAgent({
      model,
      agentFactory: new MockAgentFactory(),
      toolRegistry,
      skillRegistry,
      humanReviewGateway: hitl,
      hooks: [],
    });

    const response = await director.execute("设计一个RPG游戏的核心系统", "session-1", "design", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.agentName).toBe("Director");
  });

  it("事故回归：双命名空间计划（id=T* / fragmentId=F*）的全部子任务都应执行，而不是只有无依赖的跑通", async () => {
    // 复现 2026-10-09 策划生成事故：计划依赖写在 T 命名空间，可执行计划以 F
    // 命名空间为任务 ID。修复前依赖无法满足 → F2/F3 永远 skipped，9 个子任务
    // 只完成 2 个仍宣告成功。
    const model = new MockModelAdapter([
      ChatMessage.text("assistant", "mock", JSON.stringify({
        planId: "plan-incident",
        subTasks: [
          { id: "T1", fragmentId: "F1", domain: "gameplay_design", description: "角色池审计", dependencies: [], priority: 1 },
          { id: "T2", fragmentId: "F2", domain: "gameplay_design", description: "新角色定位", dependencies: ["T1"], priority: 2 },
          { id: "T3", fragmentId: "F3", domain: "combat_design", description: "机制平衡", dependencies: ["T1", "T2"], priority: 3 },
        ],
      })),
      ChatMessage.text("assistant", "mock", JSON.stringify([
        { fragmentId: "F1", domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "角色池审计", priority: 1 },
        { fragmentId: "F2", domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "新角色定位", priority: 2 },
        { fragmentId: "F3", domain: "combat_design", agentName: "CombatDesigner", assignment: "机制平衡", priority: 3 },
      ])),
    ]);

    const director = new DirectorAgent({
      model,
      agentFactory: new MockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: new SkillManager(),
      humanReviewGateway: new MockHumanReviewGateway(true),
      hooks: [],
    });

    const response = await director.execute("上线一个新角色并平衡现有角色", "session-incident", "design", "chief_designer");
    expect(response.success).toBe(true);
    // 修复前：completedCount=1（F2/F3 被 skipped）；修复后：3/3 全部执行
    expect(response.metadata.fileCount).toBe(3);
    const summaryText = response.message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("");
    expect(summaryText).toContain("共完成 **3** 个子任务");
    expect(summaryText).not.toContain("部分完成");
  });

  it("事故回归：LLM 路由全部回显 F1 时，代码键控的任务序号应让全部子任务执行", async () => {
    // 复现 2026-10-09 第二次事故：路由 LLM 把 6 个决策全部标成 fragmentId=F1，
    // 可执行计划变成重复 id 被去重后只剩 1 个任务（1/6 宣告部分完成）。
    // 现在任务序号由代码按位置键控，LLM 编号被忽略。
    const model = new MockModelAdapter([
      ChatMessage.text("assistant", "mock", JSON.stringify({
        planId: "plan-dup",
        subTasks: [
          { id: "T1", fragmentId: "F1", domain: "gameplay_design", description: "定位", dependencies: [], priority: 1 },
          { id: "T2", fragmentId: "F2", domain: "combat_design", description: "技能组", dependencies: ["T1"], priority: 2 },
          { id: "T3", fragmentId: "F3", domain: "qa", description: "验证", dependencies: ["T1", "T2"], priority: 3 },
        ],
      })),
      ChatMessage.text("assistant", "mock", JSON.stringify([
        { fragmentId: "F1", domain: "gameplay_design", agentName: "GameplayDesigner", assignment: "定位", priority: 1 },
        { fragmentId: "F1", domain: "combat_design", agentName: "CombatDesigner", assignment: "技能组", priority: 2 },
        { fragmentId: "F1", domain: "qa", agentName: "QAPlanner", assignment: "验证", priority: 3 },
      ])),
    ]);

    const director = new DirectorAgent({
      model,
      agentFactory: new MockAgentFactory(),
      toolRegistry: { register: vi.fn(), getToolDescriptors: vi.fn().mockReturnValue([]), getTool: vi.fn(), executeTool: vi.fn() },
      skillRegistry: new SkillManager(),
      humanReviewGateway: new MockHumanReviewGateway(true),
      hooks: [],
    });

    const response = await director.execute("上线一个新角色", "session-dup-routing", "design", "chief_designer");
    expect(response.success).toBe(true);
    expect(response.metadata.fileCount).toBe(3);
  });
});
