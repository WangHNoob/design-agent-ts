import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ParameterDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import { isToolFastFailError } from "../../core/tool/ToolFastFailError.js";

export class LangGraphToolAdapter {
  readonly lastToolMetadata = new Map<string, Record<string, unknown>>();

  private static zodTypeFromDescriptor(param: ParameterDescriptor): z.ZodTypeAny {
    let schema: z.ZodTypeAny;
    switch (param.type) {
      case "string":
        schema = param.enum && param.enum.length > 0
          ? z.enum(param.enum as [string, ...string[]])
          : z.string();
        break;
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "array":
        schema = z.array(z.unknown());
        break;
      case "object":
        schema = z.record(z.unknown());
        break;
      default:
        schema = z.unknown();
    }
    if (!param.required) {
      schema = schema.optional();
    }
    // Note: we intentionally omit .default() here because some API providers
    // (e.g. Anthropic) reject schemas containing the "default" keyword in
    // tool input_schema. The default value is handled at the tool level.
    return schema.describe(param.description);
  }

  toLangGraphTool(toolPort: ToolPort): DynamicStructuredTool {
    const descriptor = toolPort.getDescriptor();

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [name, param] of Object.entries(descriptor.parameters)) {
      shape[name] = LangGraphToolAdapter.zodTypeFromDescriptor(param);
    }

    return new DynamicStructuredTool({
      name: descriptor.name,
      description: descriptor.description,
      schema: z.object(shape),
      func: async (input) => {
        try {
          const result = await toolPort.execute(input as Record<string, unknown>);
          this.lastToolMetadata.set(descriptor.name, result.metadata);
          return result.output;
        } catch (err) {
          // FastFail must abort the agent loop — do not swallow as observation.
          if (isToolFastFailError(err)) throw err;
          return ToolResult.error(err instanceof Error ? err.message : String(err)).output;
        }
      },
    });
  }

  toLangGraphTools(toolPorts: ToolPort[]): DynamicStructuredTool[] {
    return toolPorts.map((t) => this.toLangGraphTool(t));
  }
}
