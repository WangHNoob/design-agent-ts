import { describe, it, expect } from "vitest";
import { loadMcpTools } from "../../../../src/core/tool/mcp/McpToolLoader";
import type {
  McpClientPort,
  McpToolDefinition,
  McpToolCallResult,
} from "../../../../src/port/mcp/McpClientPort";

interface FakeOptions {
  serverName: string;
  tools?: McpToolDefinition[];
  failOnConnect?: boolean;
  failOnList?: boolean;
}

function createFakeClient(opts: FakeOptions): McpClientPort & { connected: boolean; disconnected: boolean } {
  return {
    serverName: opts.serverName,
    connected: false,
    disconnected: false,
    async connect() {
      if (opts.failOnConnect) throw new Error("connect failed");
      this.connected = true;
    },
    async disconnect() {
      this.disconnected = true;
      this.connected = false;
    },
    isConnected() {
      return this.connected;
    },
    async listTools() {
      if (opts.failOnList) throw new Error("list failed");
      return opts.tools ?? [];
    },
    async callTool(): Promise<McpToolCallResult> {
      return { content: "", isError: false, metadata: {} };
    },
  };
}

const def = (name: string): McpToolDefinition => ({
  name,
  description: `desc ${name}`,
  inputSchema: { type: "object", properties: {} },
});

describe("loadMcpTools", () => {
  it("应连接所有 server 并加载其工具", async () => {
    const c1 = createFakeClient({ serverName: "s1", tools: [def("a"), def("b")] });
    const c2 = createFakeClient({ serverName: "s2", tools: [def("c")] });

    const result = await loadMcpTools([{ client: c1 }, { client: c2 }]);

    expect(result.tools).toHaveLength(3);
    expect(result.toolNames).toEqual(["a", "b", "c"]);
    expect(result.failedServers).toEqual([]);
    expect(c1.connected).toBe(true);
    expect(c2.connected).toBe(true);
  });

  it("应对工具名应用前缀", async () => {
    const c1 = createFakeClient({ serverName: "s1", tools: [def("get_wiki")] });
    const result = await loadMcpTools([{ client: c1, toolPrefix: "kb_" }]);

    expect(result.toolNames).toEqual(["kb_get_wiki"]);
  });

  it("单个 server 连接失败不应阻断其他 server（降级可审计）", async () => {
    const bad = createFakeClient({ serverName: "bad", failOnConnect: true });
    const good = createFakeClient({ serverName: "good", tools: [def("x")] });

    const result = await loadMcpTools([{ client: bad }, { client: good }]);

    expect(result.tools).toHaveLength(1);
    expect(result.toolNames).toEqual(["x"]);
    expect(result.failedServers).toHaveLength(1);
    expect(result.failedServers[0]?.serverName).toBe("bad");
    expect(result.failedServers[0]?.error).toContain("connect failed");
  });

  it("listTools 失败应记录并清理连接", async () => {
    const c = createFakeClient({ serverName: "s", failOnList: true });
    const result = await loadMcpTools([{ client: c }]);

    expect(result.tools).toHaveLength(0);
    expect(result.failedServers).toHaveLength(1);
    expect(result.failedServers[0]?.error).toContain("list failed");
    expect(c.disconnected).toBe(true);
  });

  it("空 entry 列表应返回空结果", async () => {
    const result = await loadMcpTools([]);
    expect(result.tools).toEqual([]);
    expect(result.toolNames).toEqual([]);
    expect(result.failedServers).toEqual([]);
  });
});
