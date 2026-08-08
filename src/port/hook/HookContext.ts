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
  /** LLM 思考内容（reasoning model 的 reasoning_content，流式累积，set by adapter）。 */
  llmReasoning?: string;
  /** LLM 可见输出（首个模型响应的文本预览，set by adapter）。 */
  llmOutput?: string;
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
