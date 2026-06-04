import type { ChatMessage } from "../message/ChatMessage.js";
import type { AgentDescriptor } from "./AgentDescriptor.js";
import type { AgentResponse } from "./AgentResponse.js";

export interface AgentProcessOptions {
  /** AbortSignal to cancel the agent execution. When aborted, the agent stops all LLM calls and returns early. */
  signal?: AbortSignal;
}

export interface AgentPort {
  getDescriptor(): AgentDescriptor;
  process(sessionId: string, messages: ChatMessage[], options?: AgentProcessOptions): Promise<AgentResponse>;
  processStream?(sessionId: string, messages: ChatMessage[], options?: AgentProcessOptions): AsyncIterable<AgentResponse>;
  getName(): string;
}
