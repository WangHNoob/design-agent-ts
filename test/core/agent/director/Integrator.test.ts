import { describe, it, expect } from "vitest";
import { Integrator } from "../../../../src/core/agent/director/Integrator";
import type { TaskResult } from "../../../../src/core/schema/TaskResult";
import type { Domain } from "../../../../src/core/schema/TaskPlan";

function result(taskId: string, domain: Domain, output: string): TaskResult {
  return { taskId, domain, status: "success", output, errorMessage: null };
}

describe("Integrator", () => {
  it("应为每个有产出的任务生成独立文档", () => {
    const integrator = new Integrator();
    const results = [
      result("t1", "system_design", "# 系统设计\n\n核心循环说明"),
      result("t2", "combat_design", "# 战斗设计\n\n连招体系"),
    ];

    const { documents } = integrator.integrateStructured(results);
    const taskDocs = documents.filter((d) => d.taskId === "t1" || d.taskId === "t2");
    expect(taskDocs).toHaveLength(2);
    expect(taskDocs[0]?.fileName).toBe("t1_系统设计");
    expect(taskDocs[1]?.fileName).toBe("t2_战斗设计");
  });

  it("应跳过空产出", () => {
    const integrator = new Integrator();
    const results = [
      result("t1", "system_design", "有内容"),
      result("t2", "combat_design", "   "),
    ];
    const { documents } = integrator.integrateStructured(results);
    expect(documents.filter((d) => d.taskId.startsWith("t")).map((d) => d.taskId)).toEqual(["t1"]);
  });

  it("应仅整合 success 结果", () => {
    const integrator = new Integrator();
    const failed: TaskResult = {
      taskId: "failed",
      domain: "combat_design",
      status: "error",
      output: "不应进入最终文档",
      errorMessage: "failed",
    };

    const { documents } = integrator.integrateStructured([
      result("success", "system_design", "有效产出"),
      failed,
    ]);

    expect(documents.some((document) => document.taskId === "success")).toBe(true);
    expect(documents.some((document) => document.taskId === "failed")).toBe(false);
    expect(integrator.integrate([failed])).not.toContain("不应进入最终文档");
  });

  it("应从 key:value 抽取数值字段并检测跨 Agent 冲突", () => {
    const integrator = new Integrator();
    const results = [
      result("t1", "combat_design", "暴击伤害: 1.5\n说明文本"),
      result("t2", "numerical_planning", "暴击伤害: 2.0\n数值说明"),
    ];

    const { conflicts, documents } = integrator.integrateStructured(results);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.type).toBe("字段冲突");
    expect(conflicts[0]?.description).toContain("暴击伤害");
    // 冲突报告 + 字段注册表文档应被附加
    expect(documents.some((d) => d.taskId === "conflicts")).toBe(true);
    expect(documents.some((d) => d.taskId === "field_registry")).toBe(true);
  });

  it("应从 markdown 表格行抽取字段", () => {
    const integrator = new Integrator();
    const md = "| 字段 | 值 |\n| --- | --- |\n| 攻击力 | 50 |";
    const results = [
      result("t1", "numerical_planning", md),
      result("t2", "system_design", "| 攻击力 | 80 |"),
    ];

    const { conflicts } = integrator.integrateStructured(results);
    expect(conflicts.some((c) => c.description.includes("攻击力"))).toBe(true);
  });

  it("值一致时不应产生冲突文档", () => {
    const integrator = new Integrator();
    const results = [
      result("t1", "combat_design", "攻速: 100"),
      result("t2", "numerical_planning", "攻速: 100"),
    ];
    const { conflicts, documents } = integrator.integrateStructured(results);
    expect(conflicts).toHaveLength(0);
    expect(documents.some((d) => d.taskId === "conflicts")).toBe(false);
  });

  it("向后兼容的 integrate() 应返回合并报告字符串", () => {
    const integrator = new Integrator();
    const out = integrator.integrate([result("t1", "system_design", "内容")]);
    expect(out).toContain("# 整合报告");
    expect(out).toContain("系统设计");
  });

  it("向后兼容的 detectConflicts() 应返回字符串描述", () => {
    const integrator = new Integrator();
    const results = [
      result("t1", "combat_design", "暴击率: 0.3"),
      result("t2", "numerical_planning", "暴击率: 0.5"),
    ];
    const descs = integrator.detectConflicts(results);
    expect(descs.length).toBe(1);
    expect(descs[0]).toContain("暴击率");
  });
});
