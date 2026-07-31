import type { ToolResult } from "./ToolResult.js";

export interface CompensateContext {
  readonly sessionId?: string;
  readonly agentName?: string;
  readonly toolName: string;
}

/**
 * Saga compensate contract for reversible tools.
 *
 * Infrastructure (SagaCoordinator, LangGraphToolAdapter journal, failure queue) is
 * production-ready. Business tools opt in by implementing {@link ToolPort.getCompensateHandler};
 * no bootstrap placeholder tools are required until a tool actually needs rollback.
 */
export interface CompensateHandler {
  compensate(
    args: Record<string, unknown>,
    forwardResult: ToolResult,
    context: CompensateContext,
  ): Promise<ToolResult>;
  /** When compensate itself fails; default "queue" (never silent). */
  readonly onCompensateFailure?: "queue" | "ignore";
}
