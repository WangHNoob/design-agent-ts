import type { ChatMessage } from "../message/ChatMessage.js";

export interface HookContext {
  agentName?: string;
  sessionId?: string;
  messages?: ChatMessage[];
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: string;
  error?: Error;
  iteration?: number;
  maxIterations?: number;
  metadata: Record<string, unknown>;
  abort: boolean;
}

export namespace HookContext {
  export function create(initial?: Partial<HookContext>): HookContext {
    return { metadata: {}, abort: false, ...initial };
  }
}
