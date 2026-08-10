import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type {
  CostAggregate,
  CostAggregateOptions,
  CostGroupDimension,
  CostUsageRecord,
  TopSpendersOptions,
} from "../../port/cost/types.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

interface StoredUsage extends CostUsageRecord {
  readonly id: string;
  readonly createdAt: string;
}

function tokenTotal(row: Pick<CostAggregate, "inputTokens" | "outputTokens">): number {
  return row.inputTokens + row.outputTokens;
}

export class InMemoryCostStore implements CostStorePort {
  private readonly records: StoredUsage[] = [];

  constructor(private readonly idGenerator: IdGeneratorPort) {}

  async recordUsage(record: CostUsageRecord): Promise<void> {
    this.records.push({
      ...record,
      id: this.idGenerator.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  async aggregate(options: CostAggregateOptions): Promise<CostAggregate[]> {
    const rows = this.filterByTime(this.records, options.from, options.to)
      .filter((r) => !options.userId || r.userId === options.userId);
    return this.groupRows(rows, options.groupBy);
  }

  async listTopSpenders(options: TopSpendersOptions = {}): Promise<CostAggregate[]> {
    const grouped = await this.aggregate({
      groupBy: "userId",
      from: options.from,
      to: options.to,
    });
    const limit = Math.max(1, Math.min(100, options.limit ?? 10));
    return grouped
      .sort((a, b) => tokenTotal(b) - tokenTotal(a))
      .slice(0, limit);
  }

  /** Test helper — all stored usage rows. */
  all(): readonly StoredUsage[] {
    return this.records;
  }

  private filterByTime(
    rows: StoredUsage[],
    from?: string,
    to?: string,
  ): StoredUsage[] {
    const fromMs = from ? Date.parse(from) : undefined;
    const toMs = to ? Date.parse(to) : undefined;
    return rows.filter((row) => {
      const ts = Date.parse(row.createdAt);
      if (fromMs !== undefined && ts < fromMs) return false;
      if (toMs !== undefined && ts > toMs) return false;
      return true;
    });
  }

  private groupRows(
    rows: StoredUsage[],
    dimension: CostGroupDimension,
  ): CostAggregate[] {
    const buckets = new Map<string, CostAggregate>();
    for (const row of rows) {
      const key = this.dimensionKey(row, dimension);
      if (!key) continue;
      const existing = buckets.get(key) ?? {
        key,
        dimension,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostMicros: 0,
        recordCount: 0,
      };
      buckets.set(key, {
        ...existing,
        inputTokens: existing.inputTokens + row.inputTokens,
        outputTokens: existing.outputTokens + row.outputTokens,
        estimatedCostMicros: existing.estimatedCostMicros + row.estimatedCostMicros,
        recordCount: existing.recordCount + 1,
      });
    }
    return [...buckets.values()].sort(
      (a, b) => tokenTotal(b) - tokenTotal(a),
    );
  }

  private dimensionKey(row: CostUsageRecord, dimension: CostGroupDimension): string | null {
    switch (dimension) {
      case "userId":
        return row.userId;
      case "agent":
        return row.agentName ?? null;
      case "workflow":
        return row.workflowId ?? null;
      case "model":
        return row.modelName ?? null;
      default:
        return null;
    }
  }
}
