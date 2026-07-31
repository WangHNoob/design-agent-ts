import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { ModelOptions } from "../../port/model/ModelOptions.js";
import type { ModelResponse } from "../../port/model/ModelResponse.js";
import type { ModelConfig } from "../../port/model/ModelConfig.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type { RateLimitPort } from "../../port/cost/RateLimitPort.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { estimateCostMicros, type CostPricing } from "./estimateCost.js";
import { RateLimitError } from "./RateLimitError.js";

export interface MeteredChatModelOptions {
  /** Record token usage to CostStore. */
  costEnabled: boolean;
  /** Enforce TPM pre/post checks (same semantics as RateLimitHook). */
  rateLimitEnabled: boolean;
  tpmEstimatePerCall: number;
  rateLimit: RateLimitPort;
  costStore: CostStorePort;
  pricing: CostPricing;
  tracer?: TracerPort;
  resolveUserId?: () => string | undefined;
  resolveWorkflowId?: () => string | undefined;
  defaultAgentName?: string;
}

/**
 * Decorates ChatModelPort with TPM checks and cost attribution for Director paths
 * (TaskPlanner / Router) that bypass LangGraph agent hooks.
 */
export class MeteredChatModel implements ChatModelPort {
  constructor(
    private readonly base: ChatModelPort,
    private readonly options: MeteredChatModelOptions,
  ) {}

  async generate(
    messages: ChatMessage[],
    modelOptions?: ModelOptions,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const userId = this.resolveUserId();
    const agentName = this.options.defaultAgentName ?? "Director";

    await this.preCheckTpm(userId);

    const response = await this.base.generate(messages, modelOptions, signal);

    await this.postRecord(userId, agentName, response);

    return response;
  }

  async *stream(
    messages: ChatMessage[],
    modelOptions?: ModelOptions,
    signal?: AbortSignal,
  ): AsyncIterable<ModelResponse> {
    const userId = this.resolveUserId();
    const agentName = this.options.defaultAgentName ?? "Director";

    await this.preCheckTpm(userId);

    let lastResponse: ModelResponse | undefined;
    for await (const chunk of this.base.stream(messages, modelOptions, signal)) {
      lastResponse = chunk;
      yield chunk;
    }

    if (lastResponse) {
      await this.postRecord(userId, agentName, lastResponse);
    }
  }

  getModelName(): string {
    return this.base.getModelName();
  }

  getProvider(): string {
    return this.base.getProvider();
  }

  reconfigure(config: ModelConfig): void {
    this.base.reconfigure(config);
  }

  private resolveUserId(): string | undefined {
    const trace = this.options.tracer?.getCurrentTrace();
    return trace?.userId ?? this.options.resolveUserId?.();
  }

  private resolveWorkflowId(): string | undefined {
    const span = this.options.tracer?.getCurrentSpan();
    const attrs = span?.attributes;
    if (attrs && typeof attrs.workflowId === "string") return attrs.workflowId;
    if (attrs && typeof attrs.skillId === "string") return attrs.skillId;
    return this.options.resolveWorkflowId?.();
  }

  private async preCheckTpm(userId: string | undefined): Promise<void> {
    if (!this.options.rateLimitEnabled || !userId) return;

    try {
      const result = await this.options.rateLimit.checkAndConsume({
        userId,
        tpmDelta: this.options.tpmEstimatePerCall,
        consume: false,
      });
      if (!result.allowed) {
        const code = result.code ?? "RATE_LIMIT_TPM";
        throw new RateLimitError(
          `${code}: tokens per minute limit exceeded`,
          code,
          result.retryAfterMs,
        );
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      throw new RateLimitError(
        "RATE_LIMIT_TPM: rate limit backend unavailable",
        "RATE_LIMIT_TPM",
      );
    }
  }

  private async postRecord(
    userId: string | undefined,
    agentName: string,
    response: ModelResponse,
  ): Promise<void> {
    const inputTokens = response.inputTokenCount ?? 0;
    const outputTokens = response.outputTokenCount ?? 0;
    const delta = inputTokens + outputTokens;

    if (userId && delta > 0 && this.options.rateLimitEnabled) {
      try {
        const result = await this.options.rateLimit.checkAndConsume({
          userId,
          tpmDelta: delta,
        });
        if (!result.allowed) {
          const code = result.code ?? "RATE_LIMIT_TPM";
          throw new RateLimitError(
            `${code}: tokens per minute limit exceeded after LLM call`,
            code,
            result.retryAfterMs,
          );
        }
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        throw new RateLimitError(
          "RATE_LIMIT_TPM: rate limit backend unavailable",
          "RATE_LIMIT_TPM",
        );
      }
    }

    if (!this.options.costEnabled || !userId || delta <= 0) return;

    const trace = this.options.tracer?.getCurrentTrace();
    const modelName = this.base.getModelName();

    try {
      await this.options.costStore.recordUsage({
        userId,
        sessionId: trace?.sessionId,
        traceId: trace?.traceId,
        executionId: trace?.executionId,
        agentName,
        workflowId: this.resolveWorkflowId(),
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
      console.warn("[MeteredChatModel] Failed to record cost usage:", err);
    }
  }
}
