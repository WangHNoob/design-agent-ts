/**
 * MCP (Model Context Protocol) client port — connects to external MCP servers
 * and exposes their tools to the agent system.
 *
 * Used for:
 * - Consuming tools published by external MCP servers (e.g. the Knowledge Hub
 *   knowledge base, which exposes `kb_*` tools for reading published releases)
 * - Keeping the core framework-agnostic: the agent system never imports an MCP
 *   SDK directly; it only depends on this port
 *
 * The lifecycle is explicit (`connect` / `disconnect`) so the composition root
 * can connect at startup and gracefully shut down.
 */

/** A tool definition advertised by an MCP server. */
export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  /**
   * JSON Schema describing the tool's input parameters (MCP `inputSchema`).
   * Typically `{ type: "object", properties: {...}, required: [...] }`.
   */
  readonly inputSchema: Record<string, unknown>;
}

/** Result of invoking a tool on an MCP server. */
export interface McpToolCallResult {
  /** Tool output, flattened to a string (structured content is JSON-stringified). */
  readonly content: string;
  /** Whether the MCP server reported the call as an error. */
  readonly isError: boolean;
  /** Optional structured metadata (e.g. sourceRefs, quality flags). */
  readonly metadata: Record<string, unknown>;
}

/**
 * Port interface for an MCP client connected to a single MCP server.
 *
 * Adapter implementations may use:
 * - stdio transport (local subprocess MCP server)
 * - SSE transport (legacy HTTP server-sent events)
 * - Streamable HTTP transport (remote HTTP MCP server)
 */
export interface McpClientPort {
  /** Stable, human-readable name of the connected server (used for logging and tool prefixing). */
  readonly serverName: string;

  /** Establish the connection and initialize the MCP session. */
  connect(): Promise<void>;

  /** Close the connection and release resources. */
  disconnect(): Promise<void>;

  /** List the tools advertised by the server. Must be called after `connect`. */
  listTools(): Promise<McpToolDefinition[]>;

  /** Invoke a tool by name. Implementations must not throw; errors map to `isError`. */
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;

  /** Whether the client currently has an active connection. */
  isConnected(): boolean;
}
