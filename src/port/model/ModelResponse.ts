import type { ChatMessage } from "../message/ChatMessage.js";

export interface ModelResponse {
  readonly message: ChatMessage;
  readonly inputTokenCount: number;
  readonly outputTokenCount: number;
  readonly finishReason: string | null;
}
