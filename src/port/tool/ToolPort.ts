import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolResult } from "./ToolResult.js";

export interface ToolPort {
  getDescriptor(): ToolDescriptor;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
