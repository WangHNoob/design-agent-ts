import type {
  CostAggregate,
  CostAggregateOptions,
  CostUsageRecord,
  TopSpendersOptions,
} from "./types.js";

export interface CostStorePort {
  recordUsage(record: CostUsageRecord): Promise<void>;
  aggregate(options: CostAggregateOptions): Promise<CostAggregate[]>;
  listTopSpenders(options?: TopSpendersOptions): Promise<CostAggregate[]>;
}
