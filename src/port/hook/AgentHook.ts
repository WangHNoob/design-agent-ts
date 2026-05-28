import type { HookPoint } from "./HookPoint.js";
import type { HookContext } from "./HookContext.js";

export interface AgentHook {
  onEvent(point: HookPoint, context: HookContext): Promise<HookContext>;
  priority?: number;
}
