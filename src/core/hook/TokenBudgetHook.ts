import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";

export interface TokenBudgetHookOptions {
  /** Hard per-trace token ceiling (input+output). 0 disables. */
  budget: number;
  /**
   * Multi-agent shared hard ceiling under the same root Trace.
   * 0 / undefined disables the independent multi-agent budget
   * (single-agent `budget` still applies when > 0).
   */
  multiAgentBudget?: number;
  /** When false, multi-agent budget checks are skipped. Default true when multiAgentBudget > 0. */
  multiAgentEnabled?: boolean;
  tracer?: TracerPort;
}

/**
 * Accumulates model tokens per active trace and aborts when the hard budget is hit.
 * Runs on post_reasoning (account) and pre_reasoning (enforce).
 *
 * Nested agents sharing a Trace use ref-counting on pre/post_agent_call so the
 * accumulator is not cleared until the outermost agent finishes. Director may
 * also call {@link clear} after endTrace as a safety net.
 */
export class TokenBudgetHook implements AgentHook {
  priority = 15;

  private readonly usedByTrace = new Map<string, number>();
  private readonly agentRefsByTrace = new Map<string, number>();

  constructor(private readonly options: TokenBudgetHookOptions) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    const singleBudget = this.options.budget;
    const multiBudget = this.options.multiAgentBudget ?? 0;
    const multiEnabled = this.options.multiAgentEnabled !== false && multiBudget > 0;
    if (singleBudget <= 0 && !multiEnabled) return context;

    const traceId = this.options.tracer?.getCurrentTrace()?.traceId;
    if (!traceId) return context;

    if (point === "pre_agent_call") {
      this.agentRefsByTrace.set(traceId, (this.agentRefsByTrace.get(traceId) ?? 0) + 1);
      return context;
    }

    if (point === "post_reasoning") {
      const delta = (context.inputTokenCount ?? 0) + (context.outputTokenCount ?? 0);
      const used = (this.usedByTrace.get(traceId) ?? 0) + delta;
      this.usedByTrace.set(traceId, used);

      if (singleBudget > 0 && used > singleBudget) {
        const reason = `Trace token budget exceeded: used=${used} budget=${singleBudget}`;
        console.warn(`[TokenBudgetHook] ${reason}`);
        await this.recordGuardSpan("guard.token_budget", reason, used, singleBudget);
        context.metadata.tokenBudgetExceeded = true;
        context.metadata.tokenBudgetUsed = used;
        context.metadata.tokenBudgetLimit = singleBudget;
      }

      if (multiEnabled && used > multiBudget) {
        const reason = `Multi-agent token budget exceeded: used=${used} budget=${multiBudget}`;
        console.warn(`[TokenBudgetHook] ${reason}`);
        await this.recordGuardSpan("guard.multi_agent_token_budget", reason, used, multiBudget);
        context.metadata.multiAgentTokenBudgetExceeded = true;
        context.metadata.multiAgentTokenBudgetUsed = used;
        context.metadata.multiAgentTokenBudgetLimit = multiBudget;
        context.metadata.tokenBudgetExceeded = true;
      }
      return context;
    }

    if (point === "pre_reasoning") {
      const used = this.usedByTrace.get(traceId) ?? 0;
      const singleExceeded = singleBudget > 0
        && (used > singleBudget || context.metadata.tokenBudgetExceeded === true);
      const multiExceeded = multiEnabled
        && (used > multiBudget || context.metadata.multiAgentTokenBudgetExceeded === true);

      if (multiExceeded) {
        const reason = `Multi-agent token budget exceeded: used=${used} budget=${multiBudget}`;
        context.abort = true;
        context.abortReason = reason;
        context.metadata.multiAgentTokenBudgetExceeded = true;
        context.metadata.tokenBudgetExceeded = true;
        await this.recordGuardSpan("guard.multi_agent_token_budget", reason, used, multiBudget);
        return context;
      }

      if (singleExceeded) {
        const reason = `Trace token budget exceeded: used=${used} budget=${singleBudget}`;
        context.abort = true;
        context.abortReason = reason;
        context.metadata.tokenBudgetExceeded = true;
        await this.recordGuardSpan("guard.token_budget", reason, used, singleBudget);
      }
      return context;
    }

    if (point === "post_agent_call" || point === "on_error") {
      const refs = (this.agentRefsByTrace.get(traceId) ?? 1) - 1;
      if (refs <= 0) {
        this.clear(traceId);
      } else {
        this.agentRefsByTrace.set(traceId, refs);
      }
      return context;
    }

    return context;
  }

  /** Test/helper: current usage for a trace. */
  getUsed(traceId: string): number {
    return this.usedByTrace.get(traceId) ?? 0;
  }

  /** Drop accumulator for a finished Trace (Director endTrace safety net). */
  clear(traceId: string): void {
    this.usedByTrace.delete(traceId);
    this.agentRefsByTrace.delete(traceId);
  }

  private async recordGuardSpan(
    name: string,
    reason: string,
    used: number,
    budget: number,
  ): Promise<void> {
    const tracer = this.options.tracer;
    if (!tracer?.getCurrentTrace()) return;
    await tracer.recordSpan({
      name,
      status: "error",
      attributes: {
        reason,
        used,
        budget,
        abortReason: reason,
      },
    });
  }
}
