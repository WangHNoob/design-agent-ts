import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { HookContext as HC } from "../../port/hook/HookContext.js";

export class LangGraphHookAdapter {
  static async runHooks(
    hooks: AgentHook[],
    point: HookPoint,
    initialContext: Partial<HookContext>
  ): Promise<HookContext> {
    let ctx = HC.create(initialContext);
    const sorted = [...hooks].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    for (const hook of sorted) {
      ctx = await hook.onEvent(point, ctx);
      if (ctx.abort) {
        return ctx;
      }
    }

    return ctx;
  }

  static wrapNodeWithHooks<TState extends Record<string, unknown>>(
    nodeFn: (state: TState) => Promise<Partial<TState>>,
    hooks: AgentHook[],
    prePoint: HookPoint,
    postPoint: HookPoint,
    contextExtractor: (state: TState) => Partial<HookContext>
  ): (state: TState) => Promise<Partial<TState>> {
    return async (state) => {
      const preCtx = await LangGraphHookAdapter.runHooks(hooks, prePoint, contextExtractor(state));
      if (preCtx.abort) {
        return {} as Partial<TState>;
      }

      const result = await nodeFn(state);

      await LangGraphHookAdapter.runHooks(hooks, postPoint, contextExtractor(state));

      return result;
    };
  }
}
