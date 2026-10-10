import type { CostStorePort } from "../../port/cost/CostStorePort.js";
import type { CostAggregate, CostAggregateOptions, CostUsageRecord, TopSpendersOptions } from "../../port/cost/types.js";
import type { DemoQuotaGuard } from "./DemoQuotaGuard.js";

/**
 * CostStorePort 装饰器：每次 LLM 记账时同步累计演示免费额度。
 * agent 钩子（CostAccountingHook）与 Director 计量（MeteredChatModel）
 * 两条记账路径都在此汇聚，保证额度统计不漏任何计量调用。
 */
export class QuotaCountingCostStore implements CostStorePort {
	constructor(
		private readonly inner: CostStorePort,
		private readonly quota: DemoQuotaGuard,
	) {}

	async recordUsage(record: CostUsageRecord): Promise<void> {
		const delta = (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
		if (delta > 0 && (await this.quota.applies(record.userId))) {
			await this.quota.record(record.userId, delta);
		}
		return this.inner.recordUsage(record);
	}

	aggregate(options: CostAggregateOptions): Promise<CostAggregate[]> {
		return this.inner.aggregate(options);
	}

	listTopSpenders(options?: TopSpendersOptions): Promise<CostAggregate[]> {
		return this.inner.listTopSpenders(options);
	}
}
