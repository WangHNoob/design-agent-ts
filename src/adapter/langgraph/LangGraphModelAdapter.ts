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
import {
  resolveProviderProtocol,
  resolveProviderBaseUrl,
  resolveReasoningIntent,
  toChatOpenAIParams,
  toChatAnthropicParams,
} from "../../config/modelReasoning.js";
import { getModelMeta } from "../../config/modelRegistry.js";

export interface LangGraphModelAdapterOptions {
  /** Ordered fallback models (same or different provider). Primary is `config`. */
  fallbacks?: readonly ModelConfig[];
  failureThreshold?: number;
  cooldownMs?: number;
  /**
   * Hard ceiling for a single non-streaming LLM call (generateOnce), ms.
   * Injected from FrameworkConfig.model.callTimeoutMs (LLM_CALL_TIMEOUT_MS);
   * fallback default keeps legacy behavior for adapters built without config.
   */
  callTimeoutMs?: number;
  tracer?: TracerPort;
  /**
   * 按用户 BYOK 覆盖：租户上下文携带 userId 且该用户配置了自己的模型时，
   * generate/stream 委托给该用户专属的适配器实例（独立断路器，不与全局
   * 回退链混用）。userId 取自 contextStorage，随执行栈自动传播。
   */
  userOverride?: {
    getUserId(): string | null;
    loadModelConfig(userId: string): Promise<ModelConfig | null>;
  };
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
  private readonly callTimeoutMs: number;
  private tracer?: TracerPort;
  private readonly userOverride?: LangGraphModelAdapterOptions["userOverride"];
  private userAdapters = new Map<string, { adapter: LangGraphModelAdapter; key: string }>();

  constructor(config: ModelConfig, options: LangGraphModelAdapterOptions = {}) {
    this.chain = [config, ...(options.fallbacks ?? [])];
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.callTimeoutMs = options.callTimeoutMs ?? 300_000;
    this.tracer = options.tracer;
    this.userOverride = options.userOverride;
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
    // provider 可以是内置协议或 models.dev 注册表 id（deepseek/zai/…）：
    // 注册表 id 解析出协议与默认 baseURL，思考参数按该模型的能力元数据分发
    const protocol = resolveProviderProtocol(config.provider);
    const baseUrl = config.baseUrl ?? resolveProviderBaseUrl(config.provider) ?? undefined;
    const intent = resolveReasoningIntent(config.provider, config.modelName, config.reasoning, config.maxTokens);

    if (protocol === "anthropic") {
      return new ChatAnthropic({
        model: config.modelName,
        apiKey: config.apiKey,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        anthropicApiUrl: baseUrl,
        ...toChatAnthropicParams(intent),
      });
    }

    const { reasoning, modelKwargs } = toChatOpenAIParams(intent);
    return new ChatOpenAI({
      model: config.modelName,
      apiKey: config.apiKey,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      configuration: baseUrl ? { baseURL: baseUrl } : undefined,
      ...(reasoning ? { reasoning } : {}),
      ...(modelKwargs ? { modelKwargs } : {}),
    });
  }

  /**
   * 解析当前租户的 BYOK 适配器：无上下文/未配置返回 null（走全局链）。
   * 实例按 (userId, 配置内容) 缓存；配置变更后 key 变化自动重建。
   */
  private async pickUserAdapter(): Promise<LangGraphModelAdapter | null> {
    if (!this.userOverride) return null;
    const userId = this.userOverride.getUserId();
    if (!userId) return null;
    let config: ModelConfig | null;
    try {
      config = await this.userOverride.loadModelConfig(userId);
    } catch (err) {
      console.warn(`[LangGraphModelAdapter] 用户模型配置加载失败，回退全局模型: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    if (!config || !config.apiKey) return null;
    const key = `${userId}:${config.provider}:${config.modelName}:${config.baseUrl ?? ""}:${config.apiKey.slice(-8)}:${JSON.stringify(config.reasoning ?? null)}`;
    const cached = this.userAdapters.get(userId);
    if (cached && cached.key === key) return cached.adapter;
    const adapter = new LangGraphModelAdapter(
      { ...config, maxTokens: config.maxTokens },
      { tracer: this.tracer, callTimeoutMs: this.callTimeoutMs },
    );
    this.userAdapters.set(userId, { adapter, key });
    return adapter;
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
    // BYOK：租户上下文有 userId 且已预热的用户适配器优先。
    // 注意必须同步读缓存——LangGraph 图直接绑这个原生实例。
    if (this.userOverride) {
      const userId = this.userOverride.getUserId();
      if (userId) {
        const cached = this.userAdapters.get(userId);
        if (cached) return cached.adapter.getLangChainModel();
      }
    }
    return this.langchainModel;
  }

  /**
   * 预热当前租户的 BYOK 适配器（异步加载用户配置并构建模型实例）。
   * 在进入租户上下文后、首个 LLM 调用前调用一次，此后 getLangChainModel
   * 同步命中缓存。
   */
  async preloadUserModel(): Promise<void> {
    await this.pickUserAdapter();
  }

  getActiveModelName(): string {
    // BYOK 生效时反映真实在用的用户模型——否则日志恒打全局名，
    // 无法区分 BYOK 是否生效（曾因此误判"配置未生效"）
    if (this.userOverride) {
      const userId = this.userOverride.getUserId();
      if (userId) {
        const cached = this.userAdapters.get(userId);
        if (cached) return cached.adapter.getActiveModelName();
      }
    }
    return this.modelName ?? "unknown";
  }

  /** 当前生效的模型配置（BYOK 缓存命中时为用户配置；否则全局链当前槽位）。 */
  getActiveModelConfig(): ModelConfig | null {
    if (this.userOverride) {
      const userId = this.userOverride.getUserId();
      if (userId) {
        const cached = this.userAdapters.get(userId);
        if (cached) return cached.adapter.getActiveModelConfig();
      }
    }
    return this.chain[this.activeIndex] ?? null;
  }

  /** 当前生效模型的上下文窗口（models.dev 注册表），未知返回 null。 */
  getActiveContextWindow(): number | null {
    const cfg = this.getActiveModelConfig();
    if (!cfg) return null;
    return getModelMeta(cfg.provider, cfg.modelName)?.context ?? null;
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
    const userAdapter = await this.pickUserAdapter();
    if (userAdapter) return userAdapter.generate(messages, options, signal);
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
    const userAdapter = await this.pickUserAdapter();
    if (userAdapter) { yield* userAdapter.stream(messages, options, signal); return; }
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

    const timeoutSignal = AbortSignal.timeout(this.callTimeoutMs);
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

    // Empty completion = retriable failure, never silent success (reasoning
    // models can burn the whole output budget on reasoning_content).
    if (!hasArrayContent && textContent.length === 0) {
      throw new Error("LLM returned an empty response");
    }

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
