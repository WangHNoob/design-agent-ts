export interface CostPricing {
  readonly inputPricePer1M: number;
  readonly outputPricePer1M: number;
  readonly modelPrices?: Readonly<
    Record<string, { readonly inputPer1M: number; readonly outputPer1M: number }>
  >;
}

/**
 * Estimate LLM call cost in micro-USD (1 USD = 1_000_000 micros).
 */
export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
  modelName: string,
  pricing: CostPricing,
): number {
  const modelPrice = pricing.modelPrices?.[modelName];
  const inputPer1M = modelPrice?.inputPer1M ?? pricing.inputPricePer1M;
  const outputPer1M = modelPrice?.outputPer1M ?? pricing.outputPricePer1M;
  const dollars =
    (inputTokens * inputPer1M + outputTokens * outputPer1M) / 1_000_000;
  return Math.round(dollars * 1_000_000);
}
