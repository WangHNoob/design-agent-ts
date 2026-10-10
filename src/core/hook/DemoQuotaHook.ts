import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";
import { DemoQuotaExceededError, type DemoQuotaGuard, type DemoQuotaUsage } from "../cost/DemoQuotaGuard.js";

export interface DemoQuotaHookOptions {
	quota: DemoQuotaGuard;
	tracer?: TracerPort;
	resolveUserId?: () => string | undefined;
	logger?: LoggerPort;
}

/**
 * 演示免费额度守卫（pre_reasoning）：每次 LLM 调用前校验全局日额度，
 * 耗尽时 abort 当前 agent 运行——防止入口放行后的长任务把余额刷穿。
 * admin / 已配 BYOK 的用户在 guard.applies 内豁免。
 */
export class DemoQuotaHook implements AgentHook {
	priority = 14;

	private readonly logger: LoggerPort;

	constructor(private readonly options: DemoQuotaHookOptions) {
		this.logger = options.logger ?? new ConsoleLogger();
	}

	async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
		if (point !== "pre_reasoning") return context;

		const userId = this.resolveUserId(context);
		if (!userId) return context;

		try {
			await this.options.quota.assertAllowed(userId);
		} catch (err) {
			if (err instanceof DemoQuotaExceededError) {
				context.abort = true;
				context.abortReason = err.message;
				context.metadata.demoQuotaExceeded = "true";
				context.metadata.demoQuotaUsage = JSON.stringify(err.usage);
				await this.safeRecordGuardSpan(err.message, err.usage);
			}
			// 额度后端故障不阻断业务（计数装饰器侧同样只告警）
		}
		return context;
	}

	private resolveUserId(context: HookContext): string | undefined {
		const trace = this.options.tracer?.getCurrentTrace();
		return (
			trace?.userId
			?? this.options.resolveUserId?.()
			?? (typeof context.metadata.userId === "string" ? context.metadata.userId : undefined)
		);
	}

	private async safeRecordGuardSpan(reason: string, usage: DemoQuotaUsage): Promise<void> {
		try {
			const tracer = this.options.tracer;
			if (!tracer?.getCurrentTrace()) return;
			await tracer.recordSpan({
				name: "guard.demo_quota",
				status: "error",
				attributes: {
					reason,
					usedToday: usage.usedToday,
					limitPerDay: usage.limitPerDay,
				},
			});
		} catch (err) {
			this.logger.warn("[DemoQuotaHook] Failed to record guard span:", { err });
		}
	}
}
