import { describe, expect, it } from "vitest";
import {
  PlanHardGuard,
  PlanViolationError,
  canReplan,
  assertWithinReplanBudget,
  PlanReplanExhaustedError,
  filterToolNames,
  resolveAllowedTools,
  assertToolAllowed,
  assertExecutable,
  DEFAULT_READ_TOOLS,
} from "../../../src/core/plan/index.js";
import { DEFAULT_TOOL_NAMES } from "../../../src/core/agent/subagents/SubAgentFactory.js";
import { ToolWhitelistWrapper } from "../../../src/core/tool/ToolWhitelistWrapper.js";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";

describe("PlanHardGuard", () => {
  it("越权工具名被拒绝", () => {
    expect(() =>
      assertToolAllowed(
        { id: "T1", domain: "system_design", allowedTools: ["wiki_lookup", "grep_search"] },
        "tavily_search",
      ),
    ).toThrow(PlanViolationError);

    try {
      assertToolAllowed(
        { id: "T1", domain: "system_design", allowedTools: ["wiki_lookup"] },
        "kg_query_node",
      );
    } catch (err) {
      expect(err).toBeInstanceOf(PlanViolationError);
      const v = err as PlanViolationError;
      expect(v.taskId).toBe("T1");
      expect(v.toolName).toBe("kg_query_node");
      expect(v.code).toBe("tool_denied");
    }
  });

  it("filterToolNames 交集正确", () => {
    expect(filterToolNames(
      ["wiki_lookup", "tavily_search", "grep_search", "kg_query_node"],
      ["wiki_lookup", "grep_search"],
    )).toEqual(["wiki_lookup", "grep_search"]);

    expect(filterToolNames(["wiki_lookup", "tavily_search"], [])).toEqual([]);
    expect(filterToolNames([], ["wiki_lookup"])).toEqual([]);
  });

  it("空数组白名单 = 禁止外部工具", () => {
    const allowed = resolveAllowedTools({
      domain: "qa",
      allowedTools: [],
    });
    expect(allowed).toEqual([]);
    expect(() => assertToolAllowed({ id: "T2", domain: "qa", allowedTools: [] }, "wiki_lookup"))
      .toThrow(/empty/);
  });

  it("缺失 allowedTools 时使用域默认", () => {
    const allowed = resolveAllowedTools({ domain: "combat_design" });
    expect(allowed).toContain("wiki_lookup");
    expect(allowed).toContain("kg_query_node");
    expect(allowed).toContain("blackboard_read");
  });

  it("域默认与 SubAgentFactory.DEFAULT_TOOL_NAMES 交集非空且含生产工具名", () => {
    const agentSet = new Set(DEFAULT_TOOL_NAMES);
    const intersection = DEFAULT_READ_TOOLS.filter((name) => agentSet.has(name));
    expect(intersection.length).toBeGreaterThan(0);
    expect(intersection).toContain("wiki_lookup");
    expect(intersection).toContain("kg_query_node");
    expect(DEFAULT_READ_TOOLS).not.toContain("wiki_page");
    expect(DEFAULT_READ_TOOLS).not.toContain("knowledge_graph");
  });

  it("依赖未满足不可执行（跳步拒绝）", () => {
    expect(() =>
      assertExecutable(
        { id: "B", dependencies: ["A"] },
        new Set(),
      ),
    ).toThrow(PlanViolationError);

    expect(() =>
      assertExecutable(
        { id: "B", dependencies: ["A"] },
        new Set(["A"]),
      ),
    ).not.toThrow();
  });

  it("重规划次数耗尽", () => {
    expect(canReplan(0, 2)).toBe(true);
    expect(canReplan(2, 2)).toBe(false);
    expect(canReplan(0, 0)).toBe(false);

    expect(() => assertWithinReplanBudget(2, 2, "T9")).toThrow(PlanReplanExhaustedError);
    expect(() => assertWithinReplanBudget(1, 2)).not.toThrow();
  });
});

describe("ToolWhitelistWrapper", () => {
  const base: ToolPort = {
    getDescriptor(): ToolDescriptor {
      return {
        name: "secret_tool",
        description: "x",
        parameters: {},
      };
    },
    async execute() {
      return ToolResult.success("ok");
    },
  };

  it("越权调用返回可审计错误", async () => {
    const denied: string[] = [];
    const wrapped = new ToolWhitelistWrapper(base, {
      taskId: "T1",
      allowedTools: ["wiki_lookup"],
      rejectUnauthorized: true,
      onDenied: (info) => { denied.push(info.toolName); },
    });
    const result = await wrapped.execute({});
    expect(result.isError).toBe(true);
    expect(result.metadata.planViolation).toBe(true);
    expect(result.metadata.code).toBe("tool_denied");
    expect(denied).toEqual(["secret_tool"]);
  });

  it("白名单内工具可执行", async () => {
    const wrapped = new ToolWhitelistWrapper(base, {
      taskId: "T1",
      allowedTools: ["secret_tool"],
      rejectUnauthorized: true,
    });
    const result = await wrapped.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toBe("ok");
  });
});

describe("PlanHardGuard namespace", () => {
  it("暴露统一 API", () => {
    expect(PlanHardGuard.filterToolNames(["a", "b"], ["b"])).toEqual(["b"]);
  });
});
