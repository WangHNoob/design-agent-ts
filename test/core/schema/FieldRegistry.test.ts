import { describe, it, expect } from "vitest";
import { FieldRegistry, domainDisplayName } from "../../../src/core/schema/FieldRegistry";

describe("FieldRegistry", () => {
  it("应注册字段并按名称查找（大小写不敏感）", () => {
    const reg = new FieldRegistry("s1");
    reg.register("t1", "暴击率", "0.5", "t1/output.md", "numerical_planning");
    reg.register("t2", "暴击率", "0.5", "t2/output.md", "combat_design");

    const found = reg.lookup("暴击率");
    expect(found).toHaveLength(2);
    expect(reg.fieldCount).toBe(1);
    expect(reg.taskCount).toBe(2);
  });

  it("相同值不应视为冲突", () => {
    const reg = new FieldRegistry();
    reg.register("t1", "HP", "100", "t1", "system_design");
    reg.register("t2", "HP", "100", "t2", "combat_design");
    expect(reg.detectConflicts()).toHaveLength(0);
  });

  it("不同值应检测为冲突", () => {
    const reg = new FieldRegistry();
    reg.register("t1", "暴击伤害", "1.5", "t1", "combat_design");
    reg.register("t2", "暴击伤害", "2.0", "t2", "numerical_planning");

    const conflicts = reg.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fieldName).toBe("暴击伤害");
    expect(conflicts[0]?.valueCount).toBe(2);
    expect(conflicts[0]?.sources).toEqual(["t1(1.5)", "t2(2.0)"]);
  });

  it("buildReport 应包含字段表与冲突段", () => {
    const reg = new FieldRegistry("sess");
    reg.register("t1", "金币", "100", "t1/output.md", "numerical_planning");
    reg.register("t2", "金币", "200", "t2/output.md", "executive_planning");

    const report = reg.buildReport();
    expect(report).toContain("# 字段注册表");
    expect(report).toContain("Session: sess");
    expect(report).toContain("| 金币 |");
    expect(report).toContain("## 字段冲突");
  });

  it("resolve 应将所有同名字段统一为裁决值", () => {
    const reg = new FieldRegistry();
    reg.register("t1", "速度", "5", "t1", "system_design");
    reg.register("t2", "速度", "8", "t2", "combat_design");
    expect(reg.detectConflicts()).toHaveLength(1);

    reg.resolve("速度", "6");
    expect(reg.detectConflicts()).toHaveLength(0);
    expect(reg.lookup("速度").every((e) => e.value === "6")).toBe(true);
  });

  it("clear 应清空所有字段", () => {
    const reg = new FieldRegistry();
    reg.register("t1", "x", "1", "t1", "qa");
    reg.clear();
    expect(reg.fieldCount).toBe(0);
    expect(reg.taskCount).toBe(0);
  });

  it("domainDisplayName 应返回中文名", () => {
    expect(domainDisplayName("system_design")).toBe("系统设计");
    expect(domainDisplayName("numerical_planning")).toBe("数值设计");
    expect(domainDisplayName("qa")).toBe("QA审查");
    expect(domainDisplayName(null)).toBe("未知");
  });
});
