import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { McpClientPort } from "../../../port/mcp/McpClientPort.js";
import { McpToolAdapter } from "./McpToolAdapter.js";

/** A client paired with the tool-name prefix to apply to its tools. */
export interface McpClientEntry {
  readonly client: McpClientPort;
  /** Optional prefix applied to every tool name from this server (e.g. "kb_"). */
  readonly toolPrefix?: string;
}

/** Per-server load outcome — drives the frontend status panel. */
export interface McpServerLoadResult {
  readonly serverName: string;
  /** The tool-name prefix applied to this server's tools (empty if none). */
  readonly toolPrefix: string;
  /** Whether the server connected and listed its tools successfully. */
  readonly connected: boolean;
  /** Failure reason when `connected` is false (degraded, not fatal). */
  readonly error?: string;
  /** Exposed (prefixed) names of the tools loaded from this server. */
  readonly toolNames: string[];
}

/** Outcome of loading tools from all configured MCP servers. */
export interface McpLoadResult {
  /** All successfully loaded tools, wrapped as ToolPorts. */
  readonly tools: ToolPort[];
  /** The exposed names of all loaded tools (for agent toolNames injection). */
  readonly toolNames: string[];
  /** Names of servers that failed to connect or list tools (degraded, not fatal). */
  readonly failedServers: Array<{ serverName: string; error: string }>;
  /** Per-server breakdown (connected/failed + each server's tools) for status reporting. */
  readonly serverResults: McpServerLoadResult[];
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
  const serverResults: McpServerLoadResult[] = [];

  for (const entry of entries) {
    const { client, toolPrefix = "" } = entry;
    const serverToolNames: string[] = [];
    try {
      await client.connect();
      const definitions = await client.listTools();
      for (const definition of definitions) {
        const adapter = new McpToolAdapter(client, definition, toolPrefix);
        tools.push(adapter);
        toolNames.push(adapter.name);
        serverToolNames.push(adapter.name);
      }
      serverResults.push({
        serverName: client.serverName,
        toolPrefix,
        connected: true,
        toolNames: serverToolNames,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failedServers.push({ serverName: client.serverName, error: message });
      serverResults.push({
        serverName: client.serverName,
        toolPrefix,
        connected: false,
        error: message,
        toolNames: [],
      });
      // Best-effort cleanup so a half-open connection doesn't leak.
      try {
        await client.disconnect();
      } catch {
        // ignore secondary failure during cleanup
      }
    }
  }

  return { tools, toolNames, failedServers, serverResults };
}
