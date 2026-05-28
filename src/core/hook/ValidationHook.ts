import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class ValidationHook implements AgentHook {
  priority = 50;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "post_reasoning" && context.toolResult) {
      const result = context.toolResult;
      if (result.includes("ERROR") || result.includes("error")) {
        console.warn(`[ValidationHook] 检测到错误输出: ${result.substring(0, 100)}`);
      }
    }
    return context;
  }
}
