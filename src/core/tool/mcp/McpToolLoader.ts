import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { McpClientPort } from "../../../port/mcp/McpClientPort.js";
import { McpToolAdapter } from "./McpToolAdapter.js";

/** A client paired with the tool-name prefix to apply to its tools. */
export interface McpClientEntry {
  readonly client: McpClientPort;
  /** Optional prefix applied to every tool name from this server (e.g. "kb_"). */
  readonly toolPrefix?: string;
}

/** Outcome of loading tools from all configured MCP servers. */
export interface McpLoadResult {
  /** All successfully loaded tools, wrapped as ToolPorts. */
  readonly tools: ToolPort[];
  /** The exposed names of all loaded tools (for agent toolNames injection). */
  readonly toolNames: string[];
  /** Names of servers that failed to connect or list tools (degraded, not fatal). */
  readonly failedServers: Array<{ serverName: string; error: string }>;
}

/**
 * Connects to a set of MCP servers and wraps their advertised tools as
 * {@link ToolPort} instances. Pure orchestration over the {@link McpClientPort}
 * abstraction — no framework or infrastructure dependency.
 *
 * A single server failing to connect or list tools does not abort the load:
 * the failure is recorded in `failedServers` so the composition root can log
 * it for audit while the rest of the system continues.
 */
export async function loadMcpTools(entries: McpClientEntry[]): Promise<McpLoadResult> {
  const tools: ToolPort[] = [];
  const toolNames: string[] = [];
  const failedServers: Array<{ serverName: string; error: string }> = [];

  for (const entry of entries) {
    const { client, toolPrefix = "" } = entry;
    try {
      await client.connect();
      const definitions = await client.listTools();
      for (const definition of definitions) {
        const adapter = new McpToolAdapter(client, definition, toolPrefix);
        tools.push(adapter);
        toolNames.push(adapter.name);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedServers.push({ serverName: client.serverName, error: message });
      // Best-effort cleanup so a half-open connection doesn't leak.
      try {
        await client.disconnect();
      } catch {
        // ignore secondary failure during cleanup
      }
    }
  }

  return { tools, toolNames, failedServers };
}
