import type { ChatMessage } from "../message/ChatMessage.js";
import type { ModelOptions } from "./ModelOptions.js";
import type { ModelResponse } from "./ModelResponse.js";
import type { ModelConfig } from "./ModelConfig.js";

export interface ChatModelPort {
  generate(messages: ChatMessage[], options?: ModelOptions): Promise<ModelResponse>;
  stream(messages: ChatMessage[], options?: ModelOptions): AsyncIterable<ModelResponse>;
  getModelName(): string;
  getProvider(): string;
  reconfigure(config: ModelConfig): void;
}
