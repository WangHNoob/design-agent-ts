import { describe, it, expect } from "vitest";
import { McpToolAdapter } from "../../../../src/core/tool/mcp/McpToolAdapter";
import type {
  McpClientPort,
  McpToolDefinition,
  McpToolCallResult,
} from "../../../../src/port/mcp/McpClientPort";

/** Inline fake MCP client capturing the last call and returning a preset result. */
function createFakeClient(
  result: McpToolCallResult | (() => Promise<McpToolCallResult>),
): McpClientPort & { lastCall?: { name: string; args: Record<string, unknown> } } {
  const client = {
    serverName: "fake",
    lastCall: undefined as { name: string; args: Record<string, unknown> } | undefined,
    async connect() {},
    async disconnect() {},
    isConnected() {
      return true;
    },
    async listTools() {
      return [];
    },
    async callTool(name: string, args: Record<string, unknown>) {
      this.lastCall = { name, args };
      return typeof result === "function" ? result() : result;
    },
  };
  return client;
}

const wikiDef: McpToolDefinition = {
  name: "kb_get_wiki",
  description: "读取已发布的 Wiki 页面",
  inputSchema: {
    type: "object",
    properties: {
      pageId: { type: "string", description: "页面 ID" },
      depth: { type: "number", description: "展开深度" },
      mode: { type: "string", description: "模式", enum: ["full", "summary"] },
    },
    required: ["pageId"],
  },
};

describe("McpToolAdapter", () => {
  it("应将 MCP inputSchema 映射为 ToolDescriptor", () => {
    const client = createFakeClient({ content: "", isError: false, metadata: {} });
    const adapter = new McpToolAdapter(client, wikiDef);
    const desc = adapter.getDescriptor();

    expect(desc.name).toBe("kb_get_wiki");
    expect(desc.description).toBe("读取已发布的 Wiki 页面");
    expect(Object.keys(desc.parameters)).toEqual(["pageId", "depth", "mode"]);
    expect(desc.parameters.pageId?.type).toBe("string");
    expect(desc.parameters.pageId?.required).toBe(true);
    expect(desc.parameters.depth?.type).toBe("number");
    expect(desc.parameters.depth?.required).toBe(false);
    expect(desc.parameters.mode?.enum).toEqual(["full", "summary"]);
  });

  it("应支持工具名前缀，且调用远端时使用原始名", async () => {
    const client = createFakeClient({ content: "ok", isError: false, metadata: {} });
    const adapter = new McpToolAdapter(client, wikiDef, "hub_");

    expect(adapter.name).toBe("hub_kb_get_wiki");
    expect(adapter.getDescriptor().name).toBe("hub_kb_get_wiki");

    await adapter.execute({ pageId: "p1" });
    expect(client.lastCall?.name).toBe("kb_get_wiki");
    expect(client.lastCall?.args).toEqual({ pageId: "p1" });
  });

  it("执行成功应返回输出和元数据", async () => {
    const client = createFakeClient({
      content: "page content",
      isError: false,
      metadata: { sourceRefs: ["doc#1"] },
    });
    const adapter = new McpToolAdapter(client, wikiDef);
    const result = await adapter.execute({ pageId: "p1" });

    expect(result.isError).toBe(false);
    expect(result.output).toBe("page content");
    expect(result.metadata).toEqual({ sourceRefs: ["doc#1"] });
  });

  it("MCP 返回 isError 时应转为 ToolResult 错误", async () => {
    const client = createFakeClient({ content: "not found", isError: true, metadata: {} });
    const adapter = new McpToolAdapter(client, wikiDef);
    const result = await adapter.execute({ pageId: "missing" });

    expect(result.isError).toBe(true);
    expect(result.output).toBe("not found");
  });

  it("callTool 抛异常时应捕获并返回错误（永不抛出）", async () => {
    const client = createFakeClient(async () => {
      throw new Error("connection lost");
    });
    const adapter = new McpToolAdapter(client, wikiDef);
    const result = await adapter.execute({ pageId: "p1" });

    expect(result.isError).toBe(true);
    expect(result.output).toContain("connection lost");
  });

  it("缺失或非法 inputSchema 应安全降级为空参数", () => {
    const client = createFakeClient({ content: "", isError: false, metadata: {} });
    const def: McpToolDefinition = { name: "t", description: "", inputSchema: {} };
    const adapter = new McpToolAdapter(client, def);
    const desc = adapter.getDescriptor();

    expect(desc.parameters).toEqual({});
    expect(desc.description).toBe("MCP tool t");
  });

  it("类型数组（如 [\"string\",\"null\"]）应取首个受支持类型", () => {
    const client = createFakeClient({ content: "", isError: false, metadata: {} });
    const def: McpToolDefinition = {
      name: "t",
      description: "d",
      inputSchema: { type: "object", properties: { x: { type: ["string", "null"] } } },
    };
    const adapter = new McpToolAdapter(client, def);
    expect(adapter.getDescriptor().parameters.x?.type).toBe("string");
  });
});
