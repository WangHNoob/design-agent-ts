import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class IterationBudgetHook implements AgentHook {
  priority = 20;

  constructor(private readonly defaultMaxIterations = 10) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "on_iteration_budget") {
      const iteration = context.iteration ?? 0;
      const maxIterations = context.maxIterations ?? this.defaultMaxIterations;
      if (iteration >= maxIterations) {
        context.abort = true;
        console.warn(`[IterationBudgetHook] 迭代预算耗尽: ${iteration}/${maxIterations}`);
      }
    }
    return context;
  }
}
