import { describe, expect, test, vi } from "vitest";
import {
  toolNameMatchesPattern,
  filterToolsByPatterns,
  resolveExposedMcpTools,
  stripAndMergeMcpToolNames,
} from "../../../src/core/structured/mcpExpose.js";
import { ResilientToolWrapper } from "../../../src/core/tool/ResilientToolWrapper.js";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import { ToolCircuitRegistry } from "../../../src/core/resilience/ToolCircuitRegistry.js";
import { DirectorAgent } from "../../../src/core/agent/director/DirectorAgent.js";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import type { AgentFactory } from "../../../src/port/agent/AgentFactory.js";
import type { SkillRegistry } from "../../../src/port/skill/SkillRegistry.js";
import type { HumanReviewGateway } from "../../../src/core/agent/director/HumanReviewGateway.js";
import type { AgentDescriptor } from "../../../src/port/agent/AgentDescriptor.js";
import type { TaskAssignment } from "../../../src/core/schema/TaskAssignment.js";

describe("MCP on-demand expose", () => {
  const all = ["kb_search", "kb_read", "other_tool", "wiki_proxy"];

  test("toolNameMatchesPattern supports prefix and glob", () => {
    expect(toolNameMatchesPattern("kb_search", "kb_")).toBe(true);
    expect(toolNameMatchesPattern("kb_search", "kb_*")).toBe(true);
    expect(toolNameMatchesPattern("other_tool", "kb_")).toBe(false);
    expect(toolNameMatchesPattern("kb_search", "kb_search")).toBe(true);
  });

  test("allowedTools undefined applies defaultExposePrefixes", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "on_demand",
      defaultExposePrefixes: ["kb_"],
    });
    expect(exposed.sort()).toEqual(["kb_read", "kb_search"]);
    expect(exposed).not.toContain("other_tool");
  });

  test("allowedTools [] exposes no MCP", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "on_demand",
      defaultExposePrefixes: ["kb_"],
      skillPatterns: ["other_tool"],
      taskAllowedTools: [],
    });
    expect(exposed).toEqual([]);
  });

  test("allowedTools narrow whitelist does not expand via defaultExposePrefixes", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "on_demand",
      defaultExposePrefixes: ["kb_"],
      skillPatterns: ["kb_*"],
      taskAllowedTools: ["wiki_lookup"],
    });
    expect(exposed).toEqual([]);
  });

  test("allowedTools with MCP pattern only matches declared patterns", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "on_demand",
      defaultExposePrefixes: ["other_"],
      taskAllowedTools: ["kb_*"],
    });
    expect(exposed.sort()).toEqual(["kb_read", "kb_search"]);
    expect(exposed).not.toContain("other_tool");
  });

  test("on_demand skill patterns unlock additional tools when allowedTools undefined", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "on_demand",
      defaultExposePrefixes: [],
      skillPatterns: ["other_tool", "wiki_*"],
    });
    expect(exposed.sort()).toEqual(["other_tool", "wiki_proxy"]);
  });

  test("exposeMode=all returns every MCP tool when allowedTools undefined", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "all",
      defaultExposePrefixes: [],
    });
    expect(exposed).toEqual(all);
  });

  test("exposeMode=all still respects explicit empty whitelist", () => {
    const exposed = resolveExposedMcpTools({
      allMcpToolNames: all,
      exposeMode: "all",
      defaultExposePrefixes: ["kb_"],
      taskAllowedTools: [],
    });
    expect(exposed).toEqual([]);
  });

  test("stripAndMergeMcpToolNames removes base MCP then re-adds allowed", () => {
    const merged = stripAndMergeMcpToolNames(
      ["wiki_lookup", "kb_search", "kb_read", "tavily_search"],
      all,
      ["kb_search"],
    );
    expect(merged).toContain("wiki_lookup");
    expect(merged).toContain("tavily_search");
    expect(merged).toContain("kb_search");
    expect(merged).not.toContain("kb_read");
  });

  test("filterToolsByPatterns excludes unmatched names from descriptor.toolNames", () => {
    const descriptorToolNames = ["wiki_lookup", ...all];
    const allowed = filterToolsByPatterns(all, ["kb_"]);
    const merged = Array.from(new Set([...descriptorToolNames.filter((n) => !all.includes(n)), ...allowed]));
    expect(merged).toContain("wiki_lookup");
    expect(merged).toContain("kb_search");
    expect(merged).not.toContain("other_tool");
  });
});

describe("MCP resilient wrapper parity", () => {
  test("external MCP-like tools use ResilientToolWrapper with circuit", async () => {
    let calls = 0;
    const base: ToolPort = {
      getDescriptor(): ToolDescriptor {
        return { name: "kb_search", description: "mcp", parameters: {} };
      },
      async execute() {
        calls += 1;
        return ToolResult.error("down");
      },
    };
    const registry = new ToolCircuitRegistry({ failureThreshold: 2, cooldownMs: 60_000 });
    const wrapped = new ResilientToolWrapper(base, {
      external: true,
      circuitRegistry: registry,
      policy: {
        onError: "retry",
        maxRetries: 1,
        retryBackoffMs: 1,
        onRetryExhausted: "return_to_llm",
      },
      sleep: async () => {},
    });

    const result = await wrapped.execute({});
    expect(calls).toBe(2);
    expect(result.metadata.failureDecision).toBe("return_to_llm");
    expect(wrapped.getFailurePolicy().onError).toBe("retry");
  });
});

describe("DirectorAgent.prepareTaskAgent MCP allowlist", () => {
  const mcpNames = ["kb_search", "kb_read"];

  function createDirector(): DirectorAgent {
    const model: ChatModelPort = {
      generate: vi.fn(),
      stream: vi.fn(),
      getModelName: () => "mock",
      getProvider: () => "mock",
      reconfigure: () => {},
    };
    const agentFactory: AgentFactory = {
      createAgent: vi.fn(),
    };
    const skillRegistry: SkillRegistry = {
      register: vi.fn(),
      matchSkill: vi.fn().mockReturnValue(null),
      matchWorkflow: vi.fn().mockReturnValue(null),
      getAll: vi.fn().mockReturnValue([]),
    };
    const humanReviewGateway: HumanReviewGateway = {
      isEnabled: () => false,
      isReviewPointEnabled: () => false,
      requestReview: vi.fn().mockResolvedValue({ decision: "approved" }),
      getMaxRevisionRounds: () => 3,
    };
    return new DirectorAgent({
      model,
      agentFactory,
      toolRegistry: {
        register: vi.fn(),
        getToolDescriptors: vi.fn().mockReturnValue([]),
        getTool: vi.fn(),
        executeTool: vi.fn(),
        getGroupToolNames: vi.fn().mockReturnValue([]),
      } as never,
      skillRegistry,
      humanReviewGateway,
      hooks: [],
      mcp: {
        exposeMode: "on_demand",
        defaultExposePrefixes: ["kb_"],
        skillToolAllowlist: {},
        toolNames: mcpNames,
      },
      planHard: {
        enabled: true,
        maxReplans: 2,
        rejectUnauthorizedTools: true,
        domainToolDefaults: {},
      },
      multiAgent: {
        enabled: false,
        maxFanOut: 8,
        maxDepth: 3,
        detectCycles: true,
        handoffMaxChars: 4000,
        handoffMaxKeyPoints: 12,
        handoffMaxTotalChars: 12000,
        allowInvoke: false,
      },
    });
  }

  function baseDescriptor(): AgentDescriptor {
    return {
      name: "SystemDesigner",
      systemPrompt: "sys",
      maxIterations: 5,
      toolNames: ["wiki_lookup", "wiki_read", "kb_search", "kb_read", "tavily_search"],
      options: {},
    };
  }

  function prepare(
    director: DirectorAgent,
    allowedTools: readonly string[] | undefined,
  ) {
    const task: TaskAssignment = {
      taskId: "T1",
      domain: "system_design",
      assignment: "设计系统",
      agentDescriptor: baseDescriptor(),
      dependencies: [],
      ...(allowedTools !== undefined ? { allowedTools: [...allowedTools] } : {}),
    };
    // Access private prepareTaskAgent for unit coverage of MCP merge rules.
    return (director as unknown as {
      prepareTaskAgent: (
        t: TaskAssignment,
        sessionId: string,
      ) => { descriptor: AgentDescriptor; toolRegistry: unknown };
    }).prepareTaskAgent(task, "sess-1");
  }

  test("allowedTools: [] → toolNames 不含 kb_*", () => {
    const { descriptor } = prepare(createDirector(), []);
    expect(descriptor.toolNames.some((n) => n.startsWith("kb_"))).toBe(false);
    expect(descriptor.toolNames).not.toContain("wiki_lookup");
  });

  test("allowedTools: [wiki_lookup] → 不含未声明的 kb_*", () => {
    const { descriptor } = prepare(createDirector(), ["wiki_lookup"]);
    expect(descriptor.toolNames).toContain("wiki_lookup");
    expect(descriptor.toolNames.some((n) => n.startsWith("kb_"))).toBe(false);
  });

  test("allowedTools undefined + defaultExposePrefixes kb_ → 可含 kb_*", () => {
    const { descriptor } = prepare(createDirector(), undefined);
    expect(descriptor.toolNames.some((n) => n.startsWith("kb_"))).toBe(true);
    expect(descriptor.toolNames).toContain("kb_search");
  });
});
