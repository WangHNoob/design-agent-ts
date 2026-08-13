import type { AgentHook } from "../../../port/hook/AgentHook.js";
import { TokenBudgetHook } from "../../hook/TokenBudgetHook.js";

/**
 * 清除指定 trace 的 token 预算状态（含 TokenBudgetHook 与任何带 clear 的 hook）。
 * 从 DirectorAgent 拆出（纯移动，行为不变），供执行流 finally 中调用。
 */
export function clearTraceTokenBudget(hooks: AgentHook[], traceId?: string): void {
  if (!traceId) return;
  for (const hook of hooks) {
    if (hook instanceof TokenBudgetHook) {
      hook.clear(traceId);
      continue;
    }
    const maybeClear = (hook as unknown as { clear?: (id: string) => void }).clear;
    if (typeof maybeClear === "function") {
      maybeClear.call(hook, traceId);
    }
  }
}
