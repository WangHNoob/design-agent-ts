import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { ToolDescriptor, ParameterDescriptor } from "../../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../port/tool/ToolResult.js";
import type { McpClientPort, McpToolDefinition } from "../../../port/mcp/McpClientPort.js";

/** JSON Schema types the descriptor layer meaningfully supports. */
const SUPPORTED_TYPES = new Set(["string", "number", "boolean", "array", "object"]);

/**
 * Adapts a single MCP tool (advertised by an {@link McpClientPort}) into a
 * framework-agnostic {@link ToolPort}, so it flows through the existing agent
 * tool pipeline unchanged.
 *
 * - `getDescriptor()` maps the MCP `inputSchema` (JSON Schema) into a
 *   `ToolDescriptor` with a keyed `Record<string, ParameterDescriptor>`.
 * - `execute()` delegates to `McpClientPort.callTool` and never throws —
 *   failures are returned as `ToolResult.error`.
 *
 * An optional `toolPrefix` avoids name collisions when multiple MCP servers
 * expose tools with the same name. The prefix is applied to the exposed tool
 * name but stripped before calling the remote server.
 */
export class McpToolAdapter implements ToolPort {
  private readonly exposedName: string;

  constructor(
    private readonly client: McpClientPort,
    private readonly definition: McpToolDefinition,
    private readonly toolPrefix = "",
  ) {
    this.exposedName = toolPrefix ? `${toolPrefix}${definition.name}` : definition.name;
  }

  /** The name this tool is registered under in the tool registry. */
  get name(): string {
    return this.exposedName;
  }

  getDescriptor(): ToolDescriptor {
    return {
      name: this.exposedName,
      description: this.definition.description || `MCP tool ${this.definition.name}`,
      parameters: this.buildParameters(),
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(this.definition.name, args);
      if (result.isError) {
        return ToolResult.error(result.content || `MCP tool "${this.definition.name}" returned an error`);
      }
      return ToolResult.success(result.content, result.metadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return ToolResult.error(`MCP tool "${this.definition.name}" call failed: ${message}`);
    }
  }

  /** Map the MCP JSON Schema `inputSchema` into keyed ParameterDescriptors. */
  private buildParameters(): Record<string, ParameterDescriptor> {
    const schema = this.definition.inputSchema;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? new Set(schema.required.filter((r): r is string => typeof r === "string"))
      : new Set<string>();

    const params: Record<string, ParameterDescriptor> = {};
    for (const [key, raw] of Object.entries(properties)) {
      const prop = isRecord(raw) ? raw : {};
      params[key] = {
        name: key,
        type: normalizeType(prop.type),
        description: typeof prop.description === "string" ? prop.description : "",
        required: required.has(key),
        ...(extractEnum(prop.enum) ? { enum: extractEnum(prop.enum) } : {}),
      };
    }
    return params;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize a JSON Schema `type` (string or array) into a supported descriptor type. */
function normalizeType(type: unknown): string {
  // JSON Schema allows type arrays (e.g. ["string", "null"]); pick the first supported one.
  if (Array.isArray(type)) {
    const found = type.find((t) => typeof t === "string" && SUPPORTED_TYPES.has(t));
    return typeof found === "string" ? found : "string";
  }
  if (typeof type === "string" && SUPPORTED_TYPES.has(type)) {
    return type;
  }
  return "string";
}

/** Extract a string-only enum array, or undefined if not present/usable. */
function extractEnum(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((v): v is string => typeof v === "string");
  return strings.length > 0 ? strings : undefined;
}
