import type { ChatMessage } from "../message/ChatMessage.js";
import { ChatMessage as CM } from "../message/ChatMessage.js";

export interface AgentResponse {
  readonly agentName: string;
  readonly message: ChatMessage | null;
  readonly metadata: Record<string, unknown>;
  readonly success: boolean;
  readonly errorMessage: string | null;
}

export namespace AgentResponse {
  export function getTextContent(resp: AgentResponse): string | null {
    return resp.message ? CM.textContent(resp.message) : null;
  }
}
