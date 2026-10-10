import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";
import type { QuotaCounterPort } from "../../port/cost/QuotaCounterPort.js";

/**
 * QuotaCounterPort 的 Redis 实现：INCRBY 原子自增，新建 key 时补 PEXPIRE。
 * "新建"判定用返回值 === delta（与首次自增等价的概率窗口足够计数用途）。
 */
export class RedisQuotaCounterAdapter implements QuotaCounterPort {
	private readonly redis: RedisType;

	constructor(
		redisUrl: string,
		private readonly keyPrefix = "gd:",
	) {
		this.redis = new Redis.default(redisUrl, { lazyConnect: true });
	}

	async connect(): Promise<void> {
		if (this.redis.status === "wait") {
			await this.redis.connect();
		}
	}

	async incr(key: string, delta: number, ttlMs: number): Promise<number> {
		const full = key.startsWith(this.keyPrefix) ? key : `${this.keyPrefix}${key}`;
		const next = await this.redis.incrby(full, delta);
		if (next === delta) {
			await this.redis.pexpire(full, ttlMs);
		}
		return next;
	}

	async get(key: string): Promise<number> {
		const full = key.startsWith(this.keyPrefix) ? key : `${this.keyPrefix}${key}`;
		return Number(await this.redis.get(full) ?? 0);
	}

	async close(): Promise<void> {
		await this.redis.quit();
	}
}
