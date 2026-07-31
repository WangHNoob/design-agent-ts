/**
 * Framework-defined failure decisions for a single tool invocation.
 * Tools declare which path to take; the framework executes faithfully.
 */
export type ToolFailureDecision = "retry" | "return_to_llm" | "degrade" | "fast_fail";

/**
 * Declared by tools (or applied by composition-root wrappers) to control
 * post-failure behaviour. The framework does not invent failure taxonomy —
 * it only runs the declared decision.
 */
export interface ToolFailurePolicy {
  /** Primary decision when the tool returns isError or throws. */
  readonly onError: ToolFailureDecision;
  /** Max additional attempts when onError is "retry" (default 0). */
  readonly maxRetries?: number;
  /** Base backoff (ms) between retries; doubles each attempt. */
  readonly retryBackoffMs?: number;
  /**
   * After retries are exhausted (when onError is "retry").
   * Default: "return_to_llm".
   */
  readonly onRetryExhausted?: Exclude<ToolFailureDecision, "retry">;
  /** Fallback tool name when decision is "degrade". */
  readonly degradeTo?: string;
  /** Max nested degrade hops (default 1). */
  readonly maxDegradeDepth?: number;
}

/** Default policy for in-process tools: feed the error back to the LLM. */
export const DEFAULT_TOOL_FAILURE_POLICY: ToolFailurePolicy = {
  onError: "return_to_llm",
};

/**
 * Default policy for external / MCP tools: retry transient failures, then
 * return an observation to the LLM. Circuit breaker is applied separately.
 */
export const DEFAULT_EXTERNAL_TOOL_FAILURE_POLICY: ToolFailurePolicy = {
  onError: "retry",
  maxRetries: 2,
  retryBackoffMs: 200,
  onRetryExhausted: "return_to_llm",
};
