/**
 * Composition helper: translate an MCP server config entry into the transport
 * config consumed by the MCP SDK client. Extracted from bootstrap.ts.
 */
import type { McpTransportConfig } from "../../adapter/mcp/McpSdkClient.js";
import type { McpServerConfig } from "../../config/FrameworkConfig.js";

export function toMcpTransportConfig(
  server: McpServerConfig,
): McpTransportConfig | null {
  switch (server.transport) {
    case "stdio":
      if (!server.command) return null;
      return { transport: "stdio", command: server.command, args: server.args, env: server.env };
    case "sse":
      if (!server.url) return null;
      return { transport: "sse", url: server.url, headers: server.headers };
    case "http":
      if (!server.url) return null;
      return { transport: "http", url: server.url, headers: server.headers };
    default:
      return null;
  }
}
