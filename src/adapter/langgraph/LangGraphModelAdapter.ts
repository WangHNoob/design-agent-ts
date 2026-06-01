import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
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

  constructor(config: ModelConfig) {
    this.provider = config.provider === "openai-compatible" ? "openai" : config.provider;
    this.langchainModel = this.buildModel(config);
  }

  private buildModel(config: ModelConfig): ChatOpenAI | ChatAnthropic {
    switch (config.provider) {
      case "openai":
      case "openai-compatible":
        return new ChatOpenAI({
          modelName: config.modelName,
          openAIApiKey: config.apiKey,
          configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
        });
      case "anthropic":
        return new ChatAnthropic({
          modelName: config.modelName,
          anthropicApiKey: config.apiKey,
          anthropicApiUrl: config.baseUrl,
        });
    }
  }

  reconfigure(config: ModelConfig): void {
    this.provider = config.provider === "openai-compatible" ? "openai" : config.provider;
    this.langchainModel = this.buildModel(config);
  }

  getLangChainModel(): ChatOpenAI | ChatAnthropic {
    return this.langchainModel;
  }

  async generate(messages: ChatMessage[], options?: ModelOptions): Promise<ModelResponse> {
    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const lcOptions = this.mapOptions(options);

    const response = await this.langchainModel.invoke(lgMessages, lcOptions);
    const chatMessage = this.messageMapper.fromLangGraph(response);

    return {
      message: chatMessage,
      inputTokenCount: response.usage_metadata?.input_tokens ?? 0,
      outputTokenCount: response.usage_metadata?.output_tokens ?? 0,
      finishReason: response.response_metadata?.finish_reason ?? null,
    };
  }

  async *stream(messages: ChatMessage[], options?: ModelOptions): AsyncIterable<ModelResponse> {
    const lgMessages = this.messageMapper.toLangGraphList(messages);
    const lcOptions = this.mapOptions(options);

    const stream = await this.langchainModel.stream(lgMessages, lcOptions);

    for await (const chunk of stream) {
      const chatMessage = this.messageMapper.fromLangGraph(chunk);
      yield {
        message: chatMessage,
        inputTokenCount: chunk.usage_metadata?.input_tokens ?? 0,
        outputTokenCount: chunk.usage_metadata?.output_tokens ?? 0,
        finishReason: chunk.response_metadata?.finish_reason ?? null,
      };
    }
  }

  getModelName(): string {
    return this.langchainModel.modelName ?? "unknown";
  }

  getProvider(): string {
    return this.provider;
  }

  private mapOptions(options?: ModelOptions): Record<string, unknown> {
    if (!options) return {};
    return {
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stopSequences,
    };
  }
}
