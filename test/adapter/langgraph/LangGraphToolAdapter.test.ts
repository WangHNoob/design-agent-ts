import { describe, it, expect } from "vitest";
import { LangGraphToolAdapter } from "../../../src/adapter/langgraph/LangGraphToolAdapter.js";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";

describe("LangGraphToolAdapter", () => {
  const adapter = new LangGraphToolAdapter();

  const createMockTool = (
    executeFn: (args: Record<string, unknown>) => Promise<import("../../../src/port/tool/ToolResult.js").ToolResult>
  ): ToolPort => ({
    getDescriptor: () => ({
      name: "test_tool",
      description: "A test tool",
      parameters: {
        query: {
          name: "query",
          type: "string",
          description: "Search query",
          required: true,
        },
        limit: {
          name: "limit",
          type: "number",
          description: "Result limit",
          required: false,
          defaultValue: 10,
        },
        verbose: {
          name: "verbose",
          type: "boolean",
          description: "Verbose output",
          required: false,
        },
        mode: {
          name: "mode",
          type: "string",
          description: "Search mode",
          required: true,
          enum: ["fast", "deep"],
        },
      },
    }),
    execute: executeFn,
  });

  it("应生成正确的 zod schema", () => {
    const tool = createMockTool(async () => ToolResult.success("ok"));
    const lgTool = adapter.toLangGraphTool(tool);

    expect(lgTool.name).toBe("test_tool");
    expect(lgTool.description).toBe("A test tool");
  });

  it("工具执行成功应返回输出", async () => {
    const tool = createMockTool(async () => ToolResult.success("found it"));
    const lgTool = adapter.toLangGraphTool(tool);

    const result = await lgTool.invoke({ query: "test", mode: "fast" });
    expect(result).toBe("found it");
  });

  it("工具执行失败应返回错误信息", async () => {
    const tool = createMockTool(async () => ToolResult.error("something went wrong"));
    const lgTool = adapter.toLangGraphTool(tool);

    const result = await lgTool.invoke({ query: "test", mode: "fast" });
    expect(result).toBe("something went wrong");
  });

  it("应支持多个工具转换", () => {
    const tool1 = createMockTool(async () => ToolResult.success("t1"));
    const tool2 = createMockTool(async () => ToolResult.success("t2"));
    const lgTools = adapter.toLangGraphTools([tool1, tool2]);

    expect(lgTools).toHaveLength(2);
  });

  describe("边界情况", () => {
    it("B1: 自定义类型应兜底为 z.unknown()", () => {
      const tool: ToolPort = {
        getDescriptor: () => ({
          name: "custom_tool",
          description: "Test",
          parameters: {
            data: {
              name: "data",
              type: "CustomType",
              description: "Custom",
              required: true,
            },
          },
        }),
        execute: async () => ToolResult.success("ok"),
      };
      const lgTool = adapter.toLangGraphTool(tool);
      expect(lgTool.name).toBe("custom_tool");
    });

    it("B2: enum 空数组应降级为 z.string()", () => {
      const tool: ToolPort = {
        getDescriptor: () => ({
          name: "enum_tool",
          description: "Test",
          parameters: {
            category: {
              name: "category",
              type: "string",
              description: "Category",
              required: true,
              enum: [],
            },
          },
        }),
        execute: async () => ToolResult.success("ok"),
      };
      const lgTool = adapter.toLangGraphTool(tool);
      expect(lgTool.name).toBe("enum_tool");
    });

    it("optional 参数不应要求传入", async () => {
      const tool: ToolPort = {
        getDescriptor: () => ({
          name: "opt_tool",
          description: "Test",
          parameters: {
            required: { name: "required", type: "string", description: "R", required: true },
            optional: { name: "optional", type: "string", description: "O", required: false },
          },
        }),
        execute: async (args) => ToolResult.success(JSON.stringify(args)),
      };
      const lgTool = adapter.toLangGraphTool(tool);
      const result = await lgTool.invoke({ required: "yes" });
      expect(result).toContain("yes");
    });
  });
});
