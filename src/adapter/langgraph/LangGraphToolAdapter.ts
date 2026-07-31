import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ParameterDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { SagaCoordinator } from "../../core/saga/SagaCoordinator.js";
import { isToolFastFailError } from "../../core/tool/ToolFastFailError.js";
import { isToolHitlRequiredError } from "../../core/tool/ToolHitlRequiredError.js";

export interface LangGraphToolAdapterOptions {
  /** Per-invocation saga journal (adapter sets coordinator before agent process). */
  sagaRef?: { coordinator: SagaCoordinator | null };
}

export class LangGraphToolAdapter {
  readonly lastToolMetadata = new Map<string, Record<string, unknown>>();

  constructor(private readonly options: LangGraphToolAdapterOptions = {}) {}

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
          const saga = this.options.sagaRef?.coordinator;
          const compensate = toolPort.getCompensateHandler?.();
          if (saga && compensate && !result.isError) {
            saga.register(descriptor.name, input as Record<string, unknown>, result, compensate);
          }
          return result.output;
        } catch (err) {
          // FastFail must abort the agent loop — do not swallow as observation.
          if (isToolFastFailError(err)) throw err;
          if (isToolHitlRequiredError(err)) throw err;
          return ToolResult.error(err instanceof Error ? err.message : String(err)).output;
        }
      },
    });
  }

  toLangGraphTools(toolPorts: ToolPort[]): DynamicStructuredTool[] {
    return toolPorts.map((t) => this.toLangGraphTool(t));
  }
}
