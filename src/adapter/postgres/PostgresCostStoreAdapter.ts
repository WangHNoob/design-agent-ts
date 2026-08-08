import type { DatabasePort, DbRow } from "../../port/infra/DatabasePort.js";
import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type {
  CostAggregate,
  CostAggregateOptions,
  CostGroupDimension,
  CostUsageRecord,
  TopSpendersOptions,
} from "../../port/cost/types.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";

export class PostgresCostStoreAdapter implements CostStorePort {
  constructor(
    private readonly db: DatabasePort,
    private readonly idGenerator: IdGeneratorPort,
  ) {}

  async recordUsage(record: CostUsageRecord): Promise<void> {
    const id = this.idGenerator.randomUUID();
    await this.db.query(
      `INSERT INTO cost_usage (
         id, user_id, session_id, trace_id, execution_id,
         agent_name, workflow_id, model_name,
         input_tokens, output_tokens, estimated_cost_micros, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      {
        1: id,
        2: record.userId,
        3: record.sessionId ?? null,
        4: record.traceId ?? null,
        5: record.executionId ?? null,
        6: record.agentName ?? null,
        7: record.workflowId ?? null,
        8: record.modelName ?? null,
        9: record.inputTokens,
        10: record.outputTokens,
        11: record.estimatedCostMicros,
        12: new Date().toISOString(),
      },
    );
  }

  async aggregate(options: CostAggregateOptions): Promise<CostAggregate[]> {
    const column = this.groupColumn(options.groupBy);
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    let index = 1;

    if (options.userId) {
      conditions.push(`user_id = $${index}`);
      params[index.toString()] = options.userId;
      index++;
    }
    if (options.from) {
      conditions.push(`created_at >= $${index}`);
      params[index.toString()] = options.from;
      index++;
    }
    if (options.to) {
      conditions.push(`created_at <= $${index}`);
      params[index.toString()] = options.to;
      index++;
    }

    conditions.push(`${column} IS NOT NULL`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.db.query(
      `SELECT ${column} AS group_key,
              SUM(input_tokens)::bigint AS input_tokens,
              SUM(output_tokens)::bigint AS output_tokens,
              SUM(estimated_cost_micros)::bigint AS estimated_cost_micros,
              COUNT(*)::bigint AS record_count
       FROM cost_usage
       ${where}
       GROUP BY ${column}
       ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`,
      params,
    );

    return result.rows.map((row) => this.rowToAggregate(row, options.groupBy));
  }

  async listTopSpenders(options: TopSpendersOptions = {}): Promise<CostAggregate[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    let index = 1;

    if (options.from) {
      conditions.push(`created_at >= $${index}`);
      params[index.toString()] = options.from;
      index++;
    }
    if (options.to) {
      conditions.push(`created_at <= $${index}`);
      params[index.toString()] = options.to;
      index++;
    }

    const limit = Math.max(1, Math.min(100, options.limit ?? 10));
    params[index.toString()] = limit;

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.db.query(
      `SELECT user_id AS group_key,
              SUM(input_tokens)::bigint AS input_tokens,
              SUM(output_tokens)::bigint AS output_tokens,
              SUM(estimated_cost_micros)::bigint AS estimated_cost_micros,
              COUNT(*)::bigint AS record_count
       FROM cost_usage
       ${where}
       GROUP BY user_id
       ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC
       LIMIT $${index}`,
      params,
    );

    return result.rows.map((row) => this.rowToAggregate(row, "userId"));
  }

  private groupColumn(groupBy: CostGroupDimension): string {
    switch (groupBy) {
      case "userId":
        return "user_id";
      case "agent":
        return "agent_name";
      case "workflow":
        return "workflow_id";
      case "model":
        return "model_name";
      default:
        return "user_id";
    }
  }

  private rowToAggregate(row: DbRow, dimension: CostGroupDimension): CostAggregate {
    return {
      key: String(row.group_key),
      dimension,
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      estimatedCostMicros: Number(row.estimated_cost_micros ?? 0),
      recordCount: Number(row.record_count ?? 0),
    };
  }
}
