import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { ModelOptions } from "../../port/model/ModelOptions.js";
import type { ModelResponse } from "../../port/model/ModelResponse.js";
import type { ModelConfig } from "../../port/model/ModelConfig.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { LangGraphMessageMapper } from "./LangGraphMessageMapper.js";

export class LangGraphModelAdapter implements ChatModelPort {
  private messageMapper = new LangGraphMessageMapper();
  private langchainModel: ChatOpenAI | ChatAnthropic;
  private provider: string;
  private modelName: string;

  constructor(config: ModelConfig) {
    this.provider = config.provider === "openai-compatible" ? "openai" : config.provider;
    this.modelName = config.modelName;
    this.langchainModel = this.buildModel(config);
  }

  private buildModel(config: ModelConfig): ChatOpenAI | ChatAnthropic {
    const maxTokens = config.maxTokens;
    switch (config.provider) {
      case "openai":
      case "openai-compatible":
        return new ChatOpenAI({
          model: config.modelName,
          apiKey: config.apiKey,
          maxTokens,
          configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
        });
      case "anthropic":
        return new ChatAnthropic({
          model: config.modelName,
          apiKey: config.apiKey,
          maxTokens,
          anthropicApiUrl: config.baseUrl,
        });
    }
  }

  reconfigure(config: ModelConfig): void {
    this.provider = config.provider === "openai-compatible" ? "openai" : config.provider;
    this.modelName = config.modelName;
    this.langchainModel = this.buildModel(config);
  }

  getLangChainModel(): ChatOpenAI | ChatAnthropic {
    return this.langchainModel;
  }

  async generate(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): Promise<ModelResponse> {
    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const lcOptions = this.mapOptions(options);

    // Combine caller's signal with a hard timeout
    const LLM_TIMEOUT_MS = 300_000; // 5 minutes total
    const timeoutSignal = AbortSignal.timeout(LLM_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const stream = await this.langchainModel.stream(lgMessages, { ...lcOptions, signal: combinedSignal });

    // Aggregate chunks with proper block-level merging (same id → append text)
    // instead of AIMessageChunk.concat() which just concatenates arrays.
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

  async *stream(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): AsyncIterable<ModelResponse> {
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

  getModelName(): string {
    return this.modelName ?? "unknown";
  }

  getProvider(): string {
    return this.provider;
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
    // Remove undefined keys to avoid sending empty params to API
    for (const key of Object.keys(mapped)) {
      if (mapped[key] === undefined) {
        delete mapped[key];
      }
    }
    return mapped;
  }
}
