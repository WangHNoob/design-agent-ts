import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";

const CHECKPOINTS = new Set<HookPoint>([
  "pre_reasoning",
  "pre_tool_execution",
  "post_tool_execution",
]);

/**
 * Cooperative cancellation: when `metadata.abortSignal` is aborted, fail loud with CANCELLED.
 * Adapter must inject abortSignal into hook context at each checkpoint.
 */
export class CancellationHook implements AgentHook {
  priority = 1;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (!CHECKPOINTS.has(point)) return context;
    const signal = context.metadata.abortSignal as AbortSignal | undefined;
    if (signal?.aborted) {
      context.abort = true;
      context.abortReason = "CANCELLED";
    }
    return context;
  }
}
