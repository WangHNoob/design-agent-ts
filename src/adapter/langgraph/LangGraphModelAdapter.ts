import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage } from "@langchain/core/messages";
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { ModelOptions } from "../../port/model/ModelOptions.js";
import type { ModelResponse } from "../../port/model/ModelResponse.js";
import type { ModelConfig } from "../../port/model/ModelConfig.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { classifyModelError } from "../../core/model/classifyModelError.js";
import { ModelCircuitBreaker } from "../../core/model/ModelCircuitBreaker.js";
import { LangGraphMessageMapper } from "./LangGraphMessageMapper.js";

export interface LangGraphModelAdapterOptions {
  /** Ordered fallback models (same or different provider). Primary is `config`. */
  fallbacks?: readonly ModelConfig[];
  failureThreshold?: number;
  cooldownMs?: number;
  tracer?: TracerPort;
}

/**
 * LangGraph-backed ChatModelPort with an optional fallback chain.
 * On timeout / 429 / consecutive failures the active slot opens and the next
 * available model is promoted. Switch events are recorded on the active Trace.
 */
export class LangGraphModelAdapter implements ChatModelPort {
  private messageMapper = new LangGraphMessageMapper();
  private chain: ModelConfig[];
  private breakers: ModelCircuitBreaker[];
  private activeIndex = 0;
  private langchainModel!: ChatOpenAI | ChatAnthropic;
  private provider!: string;
  private modelName!: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private tracer?: TracerPort;

  constructor(config: ModelConfig, options: LangGraphModelAdapterOptions = {}) {
    this.chain = [config, ...(options.fallbacks ?? [])];
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.tracer = options.tracer;
    this.breakers = this.chain.map(
      () => new ModelCircuitBreaker({
        failureThreshold: this.failureThreshold,
        cooldownMs: this.cooldownMs,
      }),
    );
    this.applyConfig(this.chain[0]!);
  }

  private applyConfig(config: ModelConfig): void {
    this.provider = config.provider === "openai-compatible" ? "openai" : config.provider;
    this.modelName = config.modelName;
    this.langchainModel = this.buildModel(config);
  }

  private buildModel(config: ModelConfig): ChatOpenAI | ChatAnthropic {
    const maxTokens = config.maxTokens;
    const temperature = config.temperature;
    switch (config.provider) {
      case "openai":
      case "openai-compatible":
        return new ChatOpenAI({
          model: config.modelName,
          apiKey: config.apiKey,
          maxTokens,
          temperature,
          configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
        });
      case "anthropic":
        return new ChatAnthropic({
          model: config.modelName,
          apiKey: config.apiKey,
          maxTokens,
          temperature,
          anthropicApiUrl: config.baseUrl,
        });
    }
  }

  reconfigure(config: ModelConfig): void {
    const fallbacks = this.chain.slice(1);
    this.chain = [config, ...fallbacks];
    this.breakers = this.chain.map(
      () => new ModelCircuitBreaker({
        failureThreshold: this.failureThreshold,
        cooldownMs: this.cooldownMs,
      }),
    );
    this.activeIndex = 0;
    this.applyConfig(config);
  }

  setTracer(tracer: TracerPort | undefined): void {
    this.tracer = tracer;
  }

  getLangChainModel(): ChatOpenAI | ChatAnthropic {
    return this.langchainModel;
  }

  getActiveModelName(): string {
    return this.modelName;
  }

  getChainLength(): number {
    return this.chain.length;
  }

  /**
   * Promote to the next available model after a retriable failure.
   * Returns true if a new model was activated (caller should retry).
   */
  promoteFallback(error: unknown): boolean {
    if (classifyModelError(error) !== "retriable") {
      return false;
    }
    this.breakers[this.activeIndex]?.recordFailure();
    const from = this.chain[this.activeIndex]!;
    const next = this.findNextAvailable(this.activeIndex + 1);
    if (next === null) {
      return false;
    }
    this.activeIndex = next;
    this.applyConfig(this.chain[next]!);
    void this.recordSwitch(from, this.chain[next]!, error);
    return true;
  }

  /** Mark current model healthy (closes its breaker). */
  recordSuccess(): void {
    this.breakers[this.activeIndex]?.recordSuccess();
  }

  async generate(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): Promise<ModelResponse> {
    let lastError: unknown;
    const attempted = new Set<number>();

    while (attempted.size < this.chain.length) {
      const index = this.resolveActiveIndex();
      if (index === null) {
        break;
      }
      attempted.add(index);
      this.activeIndex = index;
      this.applyConfig(this.chain[index]!);

      try {
        const result = await this.generateOnce(messages, options, signal);
        this.recordSuccess();
        return result;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (!this.promoteFallback(error)) {
          throw this.unavailableError(error);
        }
      }
    }

    throw this.unavailableError(lastError);
  }

  async *stream(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): AsyncIterable<ModelResponse> {
    // Stream does not auto-replay mid-flight tokens across models; fail over before yield.
    let lastError: unknown;
    const attempted = new Set<number>();

    while (attempted.size < this.chain.length) {
      const index = this.resolveActiveIndex();
      if (index === null) break;
      attempted.add(index);
      this.activeIndex = index;
      this.applyConfig(this.chain[index]!);

      try {
        yield* this.streamOnce(messages, options, signal);
        this.recordSuccess();
        return;
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (!this.promoteFallback(error)) {
          throw this.unavailableError(error);
        }
      }
    }

    throw this.unavailableError(lastError);
  }

  getModelName(): string {
    return this.modelName ?? "unknown";
  }

  getProvider(): string {
    return this.provider;
  }

  private resolveActiveIndex(): number | null {
    if (this.breakers[this.activeIndex]?.allow()) {
      return this.activeIndex;
    }
    return this.findNextAvailable(0);
  }

  private findNextAvailable(fromIndex: number): number | null {
    for (let i = fromIndex; i < this.chain.length; i++) {
      if (this.breakers[i]?.allow()) return i;
    }
    for (let i = 0; i < fromIndex; i++) {
      if (this.breakers[i]?.allow()) return i;
    }
    return null;
  }

  private unavailableError(cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause ?? "unknown");
    return new Error(
      `All models unavailable (primary + ${Math.max(0, this.chain.length - 1)} fallbacks). Last error: ${detail}`,
    );
  }

  private async recordSwitch(from: ModelConfig, to: ModelConfig, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[LangGraphModelAdapter] Fallback ${from.modelName} → ${to.modelName}: ${reason}`,
    );
    if (!this.tracer?.getCurrentTrace()) return;
    await this.tracer.recordSpan({
      name: "model.fallback",
      status: "ok",
      attributes: {
        fromModel: from.modelName,
        toModel: to.modelName,
        fromProvider: from.provider,
        toProvider: to.provider,
        reason,
      },
    });
  }

  private async generateOnce(
    messages: ChatMessage[],
    options?: ModelOptions,
    signal?: AbortSignal,
  ): Promise<ModelResponse> {
    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const lcOptions = this.mapOptions(options);

    const LLM_TIMEOUT_MS = 300_000;
    const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const stream = await this.langchainModel.stream(lgMessages, { ...lcOptions, signal: combinedSignal });

    const contentBlocks = new Map<string, Record<string, unknown>>();
    let textContent = "";
    let hasArrayContent = false;
    let lastMetadata: Record<string, unknown> = {};
    let lastAdditionalKwargs: Record<string, unknown> = {};
    let usageInput = 0;
    let usageOutput = 0;

    for await (const chunk of stream) {
      if (combinedSignal.aborted) {
        throw new Error("LLM call aborted");
      }
      const content = chunk.content;
      if (typeof content === "string") {
        textContent += content;
      } else if (Array.isArray(content)) {
        hasArrayContent = true;
        for (const block of content) {
          if (typeof block !== "object" || block === null) continue;
          const b = block as Record<string, unknown>;
          const id = (b.id as string) ?? `_idx_${contentBlocks.size}`;
          if (contentBlocks.has(id)) {
            const existing = contentBlocks.get(id)!;
            if (typeof existing.text === "string" && typeof b.text === "string") {
              existing.text += b.text;
            }
          } else {
            contentBlocks.set(id, { ...b });
          }
        }
      }
      if (chunk.response_metadata) {
        lastMetadata = { ...lastMetadata, ...(chunk.response_metadata as Record<string, unknown>) };
      }
      if (chunk.additional_kwargs) {
        lastAdditionalKwargs = { ...lastAdditionalKwargs, ...chunk.additional_kwargs };
      }
      if (chunk.usage_metadata?.input_tokens) usageInput = chunk.usage_metadata.input_tokens;
      if (chunk.usage_metadata?.output_tokens) usageOutput = chunk.usage_metadata.output_tokens;
    }

    const finalContent = hasArrayContent
      ? (Array.from(contentBlocks.values()) as unknown as string)
      : textContent;

    const response = new AIMessage({
      content: finalContent,
      response_metadata: lastMetadata,
      additional_kwargs: lastAdditionalKwargs,
      usage_metadata: { input_tokens: usageInput, output_tokens: usageOutput, total_tokens: usageInput + usageOutput },
    });

    const chatMessage = this.messageMapper.fromLangGraph(response);

    return {
      message: chatMessage,
      inputTokenCount: response.usage_metadata?.input_tokens ?? 0,
      outputTokenCount: response.usage_metadata?.output_tokens ?? 0,
      finishReason: ((response.response_metadata?.finish_reason ?? response.response_metadata?.stop_reason) as string | null | undefined) ?? null,
    };
  }

  private async *streamOnce(
    messages: ChatMessage[],
    options?: ModelOptions,
    signal?: AbortSignal,
  ): AsyncIterable<ModelResponse> {
    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const lcOptions = this.mapOptions(options);

    const stream = await this.langchainModel.stream(lgMessages, { ...lcOptions, signal });

    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new Error("LLM stream aborted");
      }
      const chatMessage = this.messageMapper.fromLangGraph(chunk);
      yield {
        message: chatMessage,
        inputTokenCount: chunk.usage_metadata?.input_tokens ?? 0,
        outputTokenCount: chunk.usage_metadata?.output_tokens ?? 0,
        finishReason: ((chunk.response_metadata?.finish_reason ?? chunk.response_metadata?.stop_reason) as string | null | undefined) ?? null,
      };
    }
  }

  private mapOptions(options?: ModelOptions): Record<string, unknown> {
    if (!options) return {};
    const mapped: Record<string, unknown> = {
      maxTokens: options.maxTokens,
      maxCompletionTokens: options.maxCompletionTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stopSequences,
    };
    for (const key of Object.keys(mapped)) {
      if (mapped[key] === undefined) {
        delete mapped[key];
      }
    }
    return mapped;
  }
}
