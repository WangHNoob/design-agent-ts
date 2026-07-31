import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolResult } from "./ToolResult.js";
import type { ToolFailurePolicy } from "./ToolFailurePolicy.js";

export interface ToolPort {
  getDescriptor(): ToolDescriptor;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
  /**
   * Optional: declare how failures of this tool should be handled
   * (Retry / ReturnToLLM / Degrade / FastFail). When absent, wrappers
   * or framework defaults apply.
   */
  getFailurePolicy?(): ToolFailurePolicy;
}
