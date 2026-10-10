import type { QuotaCounterPort } from "../../port/cost/QuotaCounterPort.js";

export interface DemoQuotaGuardOptions {
	/** 每日免费额度（input+output tokens 合计）；0 = 关闭。 */
	limitPerDay: number;
	counter: QuotaCounterPort;
	/** 当前租户角色（ALS）；admin 豁免——主人密码登录后即为 admin。 */
	resolveRole?: () => string | undefined;
	/**
	 * 用户是否配置了自己的 BYOK Key。有自己 Key 的调用烧的是用户自己的
	 * 额度，不计入也不受平台免费额度限制。
	 */
	resolveByok: (userId: string) => Promise<boolean>;
	keyPrefix?: string;
	now?: () => Date;
	/** 计数 key 保留时长（跨天后旧 key 自然过期），默认 48h。 */
	ttlMs?: number;
}

export interface DemoQuotaUsage {
	usedToday: number;
	limitPerDay: number;
	remaining: number;
	/** 额度重置时间（Asia/Shanghai 零点）ISO 字符串。 */
	resetAt: string;
}

/** 免费额度耗尽。code 供前端/网关识别后展示引导文案。 */
export class DemoQuotaExceededError extends Error {
	readonly code = "DEMO_QUOTA_EXCEEDED";
	constructor(
		message: string,
		readonly usage: DemoQuotaUsage,
	) {
		super(message);
		this.name = "DemoQuotaExceededError";
	}
}

export const DEMO_QUOTA_MESSAGE = (usage: DemoQuotaUsage): string =>
	`今日免费额度已用完（${usage.usedToday}/${usage.limitPerDay} tokens，${new Date(usage.resetAt).toLocaleString("zh-CN")} 重置）。` +
	`注册账号并配置你自己的 LLM Key 即可继续——长策划生成任务建议使用自己的 Key，免费额度不一定够。`;

/**
 * 演示模式免费额度守卫：全局共享一个日计数桶（所有未配自己 Key 的访客
 * 先到先得），这是保护平台 Key 不被恶意刷量的核心闸门。
 *
 * 豁免规则：admin（主人密码登录）与已配置 BYOK 的用户不计入、不受限。
 */
export class DemoQuotaGuard {
	private readonly prefix: string;
	private readonly now: () => Date;
	private readonly ttlMs: number;

	constructor(private readonly options: DemoQuotaGuardOptions) {
		this.prefix = options.keyPrefix ?? "gd:demo:daily:";
		this.now = options.now ?? (() => new Date());
		this.ttlMs = options.ttlMs ?? 48 * 3600_000;
	}

	/** 额度是否适用于该用户（关闭/admin/BYOK 均不适用）。解析失败不误伤（视为不适用）。 */
	async applies(userId: string): Promise<boolean> {
		if (this.options.limitPerDay <= 0) return false;
		if (this.options.resolveRole?.() === "admin") return false;
		try {
			if (await this.options.resolveByok(userId)) return false;
		} catch {
			return false;
		}
		return Boolean(userId);
	}

	/**
	 * 校验额度；不适用返回 null，适用且有余量返回当前用量，
	 * 已耗尽抛 DemoQuotaExceededError。
	 */
	async assertAllowed(userId: string): Promise<DemoQuotaUsage | null> {
		if (!(await this.applies(userId))) return null;
		const usage = await this.usage();
		if (usage.remaining <= 0) {
			throw new DemoQuotaExceededError(DEMO_QUOTA_MESSAGE(usage), usage);
		}
		return usage;
	}

	/** 记账（调用方已确认 applies）。异常只告警不中断业务。 */
	async record(userId: string, tokens: number): Promise<void> {
		if (this.options.limitPerDay <= 0 || tokens <= 0) return;
		try {
			await this.options.counter.incr(this.key(), tokens, this.ttlMs);
		} catch (err) {
			console.warn(
				`[DemoQuotaGuard] 计数失败（不影响业务）: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	async usage(): Promise<DemoQuotaUsage> {
		const used = await this.options.counter.get(this.key());
		return {
			usedToday: used,
			limitPerDay: this.options.limitPerDay,
			remaining: Math.max(0, this.options.limitPerDay - used),
			resetAt: this.resetAt().toISOString(),
		};
	}

	/** Asia/Shanghai（UTC+8，无夏令时）日键，格式 YYYYMMDD。 */
	private key(): string {
		const shifted = new Date(this.now().getTime() + 8 * 3600_000);
		return `${this.prefix}${shifted.toISOString().slice(0, 10).replace(/-/g, "")}`;
	}

	private resetAt(): Date {
		const shifted = new Date(this.now().getTime() + 8 * 3600_000);
		const dayStartUtc = Date.UTC(
			shifted.getUTCFullYear(),
			shifted.getUTCMonth(),
			shifted.getUTCDate(),
		);
		// 下一个上海零点 = 当日零点（UTC+8 口径）+ 24h，再折回 UTC
		return new Date(dayStartUtc + 24 * 3600_000 - 8 * 3600_000);
	}
}
