import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolResult } from "./ToolResult.js";
import type { ToolFailurePolicy } from "./ToolFailurePolicy.js";
import type { CompensateHandler } from "./ToolCompensate.js";

export interface ToolPort {
  getDescriptor(): ToolDescriptor;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
  /**
   * Optional: declare how failures of this tool should be handled
   * (Retry / ReturnToLLM / Degrade / FastFail). When absent, wrappers
   * or framework defaults apply.
   */
  getFailurePolicy?(): ToolFailurePolicy;
  /**
   * Optional: saga compensate handler for side-effect tools.
   * Invoked in reverse order when a later step fails or execution is aborted.
   */
  getCompensateHandler?(): CompensateHandler | undefined;
}
