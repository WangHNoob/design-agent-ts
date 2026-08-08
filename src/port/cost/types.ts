export type CostGroupDimension = "userId" | "agent" | "workflow" | "model";

export type RateLimitCode = "RATE_LIMIT_RPM" | "RATE_LIMIT_TPM";

export interface CostUsageRecord {
  readonly userId: string;
  readonly sessionId?: string;
  readonly traceId?: string;
  readonly executionId?: string;
  readonly agentName?: string;
  readonly workflowId?: string;
  readonly modelName?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Legacy column; always 0 — platform does not bill BYOK usage. */
  readonly estimatedCostMicros: number;
}

export interface CostAggregate {
  readonly key: string;
  readonly dimension: CostGroupDimension;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Legacy field; always 0 for new records. Rankings use token totals. */
  readonly estimatedCostMicros: number;
  readonly recordCount: number;
}

export interface CostAggregateOptions {
  readonly groupBy: CostGroupDimension;
  readonly from?: string;
  readonly to?: string;
  /** When set, restricts aggregation to a single tenant. */
  readonly userId?: string;
}

export interface TopSpendersOptions {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface RateLimitRemaining {
  readonly rpm?: number;
  readonly tpm?: number;
}
