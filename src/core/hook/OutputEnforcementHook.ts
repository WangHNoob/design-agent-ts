import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class OutputEnforcementHook implements AgentHook {
  priority = 40;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "post_reasoning" && context.toolResult) {
      const result = context.toolResult;
      if (!result.trim().startsWith("{") && !result.trim().startsWith("[")) {
        console.warn("[OutputEnforcementHook] 输出不是有效的 JSON/Markdown 格式");
      }
    }
    return context;
  }
}
