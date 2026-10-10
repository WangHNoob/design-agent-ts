/**
 * 最小化计数器端口：固定窗口/日额度等场景的 Redis INCRBY 语义抽象。
 * 与 RateLimitPort（按用户 RPM/TPM 分桶）不同，这里允许调用方完全控制 key，
 * 便于实现全局日额度、IP 限频等独立于用户维度的计数。
 */
export interface QuotaCounterPort {
	/**
	 * 原子自增并返回新值；当计数器由本调用创建（返回值 === delta）时，
	 * 实现需为 key 设置 ttlMs 的过期时间。
	 */
	incr(key: string, delta: number, ttlMs: number): Promise<number>;
	/** 读取当前值；key 不存在返回 0。 */
	get(key: string): Promise<number>;
}
