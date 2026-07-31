import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";

export interface TokenBudgetHookOptions {
  /** Hard per-trace token ceiling (input+output). 0 disables. */
  budget: number;
  tracer?: TracerPort;
}

/**
 * Accumulates model tokens per active trace and aborts when the hard budget is hit.
 * Runs on post_reasoning (account) and pre_reasoning (enforce).
 */
export class TokenBudgetHook implements AgentHook {
  priority = 15;

  private readonly usedByTrace = new Map<string, number>();

  constructor(private readonly options: TokenBudgetHookOptions) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (this.options.budget <= 0) return context;

    const traceId = this.options.tracer?.getCurrentTrace()?.traceId;
    if (!traceId) return context;

    if (point === "post_reasoning") {
      const delta = (context.inputTokenCount ?? 0) + (context.outputTokenCount ?? 0);
      const used = (this.usedByTrace.get(traceId) ?? 0) + delta;
      this.usedByTrace.set(traceId, used);

      if (used > this.options.budget) {
        const reason = `Trace token budget exceeded: used=${used} budget=${this.options.budget}`;
        console.warn(`[TokenBudgetHook] ${reason}`);
        await this.recordGuardSpan(reason, used);
        context.metadata.tokenBudgetExceeded = true;
        context.metadata.tokenBudgetUsed = used;
        context.metadata.tokenBudgetLimit = this.options.budget;
      }
      return context;
    }

    if (point === "pre_reasoning") {
      const used = this.usedByTrace.get(traceId) ?? 0;
      if (used > this.options.budget || context.metadata.tokenBudgetExceeded === true) {
        const reason = `Trace token budget exceeded: used=${used} budget=${this.options.budget}`;
        context.abort = true;
        context.abortReason = reason;
        context.metadata.tokenBudgetExceeded = true;
        await this.recordGuardSpan(reason, used);
      }
      return context;
    }

    if (point === "post_agent_call" || point === "on_error") {
      // Drop accumulator when agent finishes to avoid unbounded growth across many traces.
      // Keep while nested agents share the same traceId (desired: global per-trace budget).
      return context;
    }

    return context;
  }

  /** Test/helper: current usage for a trace. */
  getUsed(traceId: string): number {
    return this.usedByTrace.get(traceId) ?? 0;
  }

  private async recordGuardSpan(reason: string, used: number): Promise<void> {
    const tracer = this.options.tracer;
    if (!tracer?.getCurrentTrace()) return;
    await tracer.recordSpan({
      name: "guard.token_budget",
      status: "error",
      attributes: {
        reason,
        used,
        budget: this.options.budget,
        abortReason: reason,
      },
    });
  }
}
