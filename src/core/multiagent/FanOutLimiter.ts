export interface FanOutBatchInfo {
  batchIndex: number;
  batchSize: number;
  total: number;
  maxFanOut: number;
}

/**
 * Run items in batches of at most `maxFanOut`, preserving order.
 * When maxFanOut <= 0 or items fit in one batch, runs a single batch.
 */
export async function runFanOutBatches<T, R>(
  items: readonly T[],
  maxFanOut: number,
  runBatch: (batch: readonly T[]) => Promise<R[]>,
  onBatch?: (info: FanOutBatchInfo) => void | Promise<void>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  if (maxFanOut <= 0 || items.length <= maxFanOut) {
    return runBatch(items);
  }

  const results: R[] = [];
  let batchIndex = 0;
  for (let i = 0; i < items.length; i += maxFanOut) {
    const batch = items.slice(i, i + maxFanOut);
    await onBatch?.({
      batchIndex,
      batchSize: batch.length,
      total: items.length,
      maxFanOut,
    });
    const batchResults = await runBatch(batch);
    results.push(...batchResults);
    batchIndex += 1;
  }
  return results;
}

/** Assert layer size is within max (hard reject). Prefer {@link runFanOutBatches} for soft caps. */
export function assertFanOut(layerSize: number, max: number): void {
  if (max > 0 && layerSize > max) {
    throw new Error(`Fan-out ${layerSize} exceeds maxFanOut ${max}`);
  }
}
