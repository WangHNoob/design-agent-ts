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
  /** Active model name for the latest model call (set by adapter). */
  modelName?: string;
  /** Tokens reported by the latest model call (post_reasoning). */
  inputTokenCount?: number;
  outputTokenCount?: number;
  /** Fail-loud reason when abort=true (token budget, tool loop, etc.). */
  abortReason?: string;
  metadata: Record<string, unknown>;
  abort: boolean;
}

export namespace HookContext {
  export function create(initial?: Partial<HookContext>): HookContext {
    return { metadata: {}, abort: false, ...initial };
  }
}
