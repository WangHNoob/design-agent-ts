import type { ChatMessage } from "../message/ChatMessage.js";
import type { ModelOptions } from "./ModelOptions.js";
import type { ModelResponse } from "./ModelResponse.js";
import type { ModelConfig } from "./ModelConfig.js";

export interface ChatModelPort {
  generate(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): Promise<ModelResponse>;
  stream(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): AsyncIterable<ModelResponse>;
  getModelName(): string;
  getProvider(): string;
  reconfigure(config: ModelConfig): void;
}
