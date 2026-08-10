/**
 * Composition helper: wraps a ChatModelPort with cost metering + rate limiting
 * when enabled by config. Extracted from bootstrap.ts so the composition root
 * stays readable (see docs/hexagonal-architecture-practice.md §4.3).
 */
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type { RateLimitPort } from "../../port/cost/RateLimitPort.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import type { FrameworkConfig } from "../../config/FrameworkConfig.js";
import { MeteredChatModel } from "../../core/cost/MeteredChatModel.js";

export function createDirectorModel(
  baseModel: ChatModelPort,
  config: FrameworkConfig,
  deps: {
    costStore: CostStorePort | null;
    rateLimit: RateLimitPort | null;
    tracer: TracerPort;
    resolveUserId: () => string | undefined;
  },
): ChatModelPort {
  if (!config.cost.enabled || !deps.costStore || !deps.rateLimit) {
    return baseModel;
  }
  return new MeteredChatModel(baseModel, {
    costEnabled: true,
    rateLimitEnabled:
      config.cost.tpmLimitPerUser > 0 || config.cost.globalTpmLimit > 0,
    tpmEstimatePerCall: config.cost.tpmEstimatePerCall,
    rateLimit: deps.rateLimit,
    costStore: deps.costStore,
    tracer: deps.tracer,
    resolveUserId: deps.resolveUserId,
    defaultAgentName: "Director",
  });
}
