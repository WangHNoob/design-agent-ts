import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { estimateCostMicros, type CostPricing } from "../cost/estimateCost.js";

export interface CostAccountingHookOptions {
  enabled: boolean;
  pricing: CostPricing;
  costStore: CostStorePort;
  defaultModelName: string;
  tracer?: TracerPort;
  resolveUserId?: () => string | undefined;
}

/**
 * Records per-LLM-call token usage and estimated cost for attribution dashboards.
 */
export class CostAccountingHook implements AgentHook {
  priority = 12;

  constructor(private readonly options: CostAccountingHookOptions) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (!this.options.enabled || point !== "post_reasoning") {
      return context;
    }

    const inputTokens = context.inputTokenCount ?? 0;
    const outputTokens = context.outputTokenCount ?? 0;
    if (inputTokens + outputTokens <= 0) {
      return context;
    }

    const trace = this.options.tracer?.getCurrentTrace();
    const userId =
      trace?.userId
      ?? this.options.resolveUserId?.()
      ?? (typeof context.metadata.userId === "string" ? context.metadata.userId : undefined);
    if (!userId) {
      return context;
    }

    const modelName =
      context.modelName
      ?? (typeof context.metadata.modelName === "string" ? context.metadata.modelName : undefined)
      ?? this.options.defaultModelName;

    const workflowId =
      (typeof context.metadata.workflowId === "string" ? context.metadata.workflowId : undefined)
      ?? (typeof context.metadata.skillId === "string" ? context.metadata.skillId : undefined);

    try {
      await this.options.costStore.recordUsage({
        userId,
        sessionId: context.sessionId ?? trace?.sessionId,
        traceId: trace?.traceId,
        executionId: trace?.executionId,
        agentName: context.agentName,
        workflowId,
        modelName,
        inputTokens,
        outputTokens,
        estimatedCostMicros: estimateCostMicros(
          inputTokens,
          outputTokens,
          modelName,
          this.options.pricing,
        ),
      });
    } catch (err) {
      console.warn("[CostAccountingHook] Failed to record cost usage:", err);
    }

    return context;
  }
}
