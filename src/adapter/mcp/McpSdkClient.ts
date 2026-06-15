import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  McpClientPort,
  McpToolDefinition,
  McpToolCallResult,
} from "../../port/mcp/McpClientPort.js";

/** Transport configuration for connecting to an MCP server. */
export type McpTransportConfig =
  | {
      readonly transport: "stdio";
      /** Executable to spawn the MCP server (e.g. "node", "npx"). */
      readonly command: string;
      readonly args?: string[];
      readonly env?: Record<string, string>;
    }
  | {
      readonly transport: "sse";
      /** Server URL for the SSE endpoint. */
      readonly url: string;
      readonly headers?: Record<string, string>;
    }
  | {
      readonly transport: "http";
      /** Server URL for the Streamable HTTP endpoint. */
      readonly url: string;
      readonly headers?: Record<string, string>;
    };

const CLIENT_INFO = { name: "game-designer-ts", version: "1.0.0" } as const;

/**
 * MCP client adapter backed by `@modelcontextprotocol/sdk`.
 *
 * Wraps the SDK `Client` plus a transport (stdio / SSE / Streamable HTTP) behind
 * the framework-agnostic {@link McpClientPort}. The SDK is only imported here, in
 * the adapter layer — core/ never sees it.
 *
 * Construction takes connection primitives (command/url + env/headers); the SDK
 * client and transport are built internally, mirroring RedisMessageQueueAdapter.
 */
export class McpSdkClient implements McpClientPort {
  readonly serverName: string;
  private readonly config: McpTransportConfig;
  private client: Client | null = null;
  private connected = false;

  constructor(serverName: string, config: McpTransportConfig) {
    this.serverName = serverName;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const client = new Client(CLIENT_INFO);
    const transport = this.buildTransport();
    await client.connect(transport);
    this.client = client;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.close();
    } finally {
      this.client = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const client = this.requireClient();
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const client = this.requireClient();
    const result = await client.callTool({ name, arguments: args });
    return {
      content: flattenContent(result.content),
      isError: result.isError === true,
      metadata: extractMetadata(result),
    };
  }

  private requireClient(): Client {
    if (!this.client || !this.connected) {
      throw new Error(`MCP client "${this.serverName}" is not connected`);
    }
    return this.client;
  }

  private buildTransport(): Transport {
    switch (this.config.transport) {
      case "stdio":
        return new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
        });
      case "sse":
        return new SSEClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers ? { headers: this.config.headers } : undefined,
        });
      case "http":
        return new StreamableHTTPClientTransport(new URL(this.config.url), {
          requestInit: this.config.headers ? { headers: this.config.headers } : undefined,
        });
    }
  }
}

/** Flatten MCP tool result content blocks into a single string. */
function flattenContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : JSON.stringify(content ?? "");
  }
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        parts.push(b.text);
      } else {
        parts.push(JSON.stringify(b));
      }
    } else if (typeof block === "string") {
      parts.push(block);
    }
  }
  return parts.join("\n");
}

/** Extract structured metadata (e.g. structuredContent) from an MCP result. */
function extractMetadata(result: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (result.structuredContent && typeof result.structuredContent === "object") {
    metadata.structuredContent = result.structuredContent;
  }
  if (result._meta && typeof result._meta === "object") {
    metadata.meta = result._meta;
  }
  return metadata;
}
