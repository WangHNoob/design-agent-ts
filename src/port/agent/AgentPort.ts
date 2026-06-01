import type { ChatMessage } from "../message/ChatMessage.js";
import type { AgentDescriptor } from "./AgentDescriptor.js";
import type { AgentResponse } from "./AgentResponse.js";

export interface AgentPort {
  getDescriptor(): AgentDescriptor;
  process(sessionId: string, messages: ChatMessage[]): Promise<AgentResponse>;
  processStream?(sessionId: string, messages: ChatMessage[]): AsyncIterable<AgentResponse>;
  getName(): string;
}
