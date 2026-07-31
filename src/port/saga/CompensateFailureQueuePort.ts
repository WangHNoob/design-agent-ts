import type { ToolResult } from "../tool/ToolResult.js";

export interface CompensateFailureRecord {
  readonly toolName: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly forwardResult: ToolResult;
  readonly compensateError: string;
  readonly reason: string;
  readonly sessionId?: string;
  readonly agentName?: string;
  readonly createdAt: string;
}

export interface CompensateFailureQueuePort {
  enqueue(record: CompensateFailureRecord): Promise<void>;
}
