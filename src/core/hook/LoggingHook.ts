import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class LoggingHook implements AgentHook {
  priority = 10;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    const agentName = context.agentName ?? "unknown";
    const sessionId = context.sessionId ?? "unknown";
    console.log(`[Hook] ${point} | agent=${agentName} | session=${sessionId}`);
    return context;
  }
}
