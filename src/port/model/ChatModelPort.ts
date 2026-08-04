import type { ChatMessage } from "../message/ChatMessage.js";
import type { ModelOptions } from "./ModelOptions.js";
import type { ModelResponse } from "./ModelResponse.js";
import type { ModelConfig } from "./ModelConfig.js";
import type { TracerPort } from "../tracing/TracerPort.js";

export interface ChatModelPort {
  generate(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): Promise<ModelResponse>;
  stream(messages: ChatMessage[], options?: ModelOptions, signal?: AbortSignal): AsyncIterable<ModelResponse>;
  getModelName(): string;
  getProvider(): string;
  /**
   * Optional capability: dynamically reconfigure the underlying model
   * (provider/model/apiKey). Implementations that cannot reconfigure at
   * runtime simply omit this method — callers must use `reconfigure?.()`.
   */
  reconfigure?(config: ModelConfig): void;
  /**
   * Optional capability: attach a tracer after construction (used by the
   * composition root once tracing is initialized). Omit if unsupported.
   */
  setTracer?(tracer: TracerPort | undefined): void;
}
