import type { ToolPort } from "./ToolPort.js";
import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolResult } from "./ToolResult.js";

export interface ToolRegistry {
  register(tool: ToolPort): void;
  getToolDescriptors(): ToolDescriptor[];
  getTool(name: string): ToolPort | undefined;
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
