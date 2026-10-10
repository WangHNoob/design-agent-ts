import { describe, expect, test } from "vitest";
import {
	DemoQuotaExceededError,
	DemoQuotaGuard,
	type DemoQuotaUsage,
} from "../../../src/core/cost/DemoQuotaGuard.js";
import { QuotaCountingCostStore } from "../../../src/core/cost/QuotaCountingCostStore.js";
import { DemoQuotaHook } from "../../../src/core/hook/DemoQuotaHook.js";
import type { QuotaCounterPort } from "../../../src/port/cost/QuotaCounterPort.js";
import type { CostStorePort } from "../../../src/port/cost/CostStorePort.js";
import type { CostUsageRecord } from "../../../src/port/cost/types.js";
import type { AgentHook } from "../../../src/port/hook/AgentHook.js";
import type { HookContext } from "../../../src/port/hook/HookContext.js";
import type { HookPoint } from "../../../src/port/hook/HookPoint.js";

/** 内存计数器：与 RedisQuotaCounterAdapter 同语义（新建 key 设 TTL）。 */
class MemoryCounter implements QuotaCounterPort {
	store = new Map<string, { value: number; expireAt: number }>();
	constructor(private nowMs = () => Date.now()) {}
	async incr(key: string, delta: number, ttlMs: number): Promise<number> {
		const cur = this.store.get(key);
		if (!cur || cur.expireAt <= this.nowMs()) {
			this.store.set(key, { value: delta, expireAt: this.nowMs() + ttlMs });
			return delta;
		}
		cur.value += delta;
		return cur.value;
	}
	async get(key: string): Promise<number> {
		return this.store.get(key)?.value ?? 0;
	}
}

function makeGuard(
	overrides: Partial<ConstructorParameters<typeof DemoQuotaGuard>[0]> = {},
	counter = new MemoryCounter(),
) {
	const guard = new DemoQuotaGuard({
		limitPerDay: 1000,
		counter,
		resolveRole: () => overrides.resolveRole?.() ?? "user",
		resolveByok: overrides.resolveByok ?? (async () => false),
		keyPrefix: overrides.keyPrefix,
		now: overrides.now,
	});
	return { guard, counter };
}

// 固定"现在"，便于断言日键与重置时间（2026-10-09T10:00:00Z = 上海 18:00）
const FIXED_NOW = new Date("2026-10-09T10:00:00Z");
const baseNow = () => FIXED_NOW;

describe("DemoQuotaGuard（演示免费额度）", () => {
	test("普通无 BYOK 用户适用额度", async () => {
		const { guard } = makeGuard({ now: baseNow });
		await expect(guard.applies("u1")).resolves.toBe(true);
	});

	test("admin 豁免", async () => {
		const { guard } = makeGuard({ now: baseNow, resolveRole: () => "admin" });
		await expect(guard.applies("u1")).resolves.toBe(false);
	});

	test("已配 BYOK 的用户豁免（烧自己的额度）", async () => {
		const { guard } = makeGuard({ now: baseNow, resolveByok: async () => true });
		await expect(guard.applies("u1")).resolves.toBe(false);
	});

	test("limit=0 时全部豁免", async () => {
		const { guard } = makeGuard({ now: baseNow });
		const disabled = new DemoQuotaGuard({
			limitPerDay: 0,
			counter: new MemoryCounter(),
			resolveByok: async () => false,
			now: baseNow,
		});
		await expect(guard.applies("u1")).resolves.toBe(true);
		await expect(disabled.applies("u1")).resolves.toBe(false);
	});

	test("BYOK 解析失败不误伤（视为豁免）", async () => {
		const { guard } = makeGuard({
			now: baseNow,
			resolveByok: async () => {
				throw new Error("store down");
			},
		});
		await expect(guard.applies("u1")).resolves.toBe(false);
	});

	test("assertAllowed：有余量返回用量，耗尽抛 DemoQuotaExceededError", async () => {
		const { guard } = makeGuard({ now: baseNow });
		await guard.record("u1", 600);
		const usage = await guard.assertAllowed("u1");
		expect(usage).not.toBeNull();
		await guard.record("u1", 400);
		await expect(guard.assertAllowed("u1")).rejects.toBeInstanceOf(DemoQuotaExceededError);
		// 错误携带用量快照，供前端/网关展示引导文案
		let caught: DemoQuotaExceededError | null = null;
		try {
			await guard.assertAllowed("u1");
		} catch (err) {
			caught = err as DemoQuotaExceededError;
		}
		expect(caught?.usage.usedToday).toBe(1000);
		expect(caught?.usage.remaining).toBe(0);
		expect(caught?.message).toContain("免费额度已用完");
	});

	test("计数是全局共享桶：不同访客累计到同一额度", async () => {
		const { guard } = makeGuard({ now: baseNow });
		await guard.record("guest-a", 700);
		await guard.record("guest-b", 300);
		const usage = await guard.usage();
		expect(usage.usedToday).toBe(1000);
		expect(usage.remaining).toBe(0);
	});

	test("日键跨天重置（Asia/Shanghai 零点）", async () => {
		const counter = new MemoryCounter();
		let now = new Date("2026-10-09T10:00:00Z");
		const { guard } = makeGuard({ now: () => now }, counter);
		await guard.record("u1", 1000);
		// 上海时间 2026-10-10 00:00 = UTC 2026-10-09T16:00:00Z
		now = new Date("2026-10-09T16:00:00Z");
		await expect(guard.assertAllowed("u1")).resolves.toMatchObject({ usedToday: 0 });
	});

	test("usage.resetAt 指向下一个上海零点", async () => {
		const { guard } = makeGuard({ now: baseNow });
		const usage: DemoQuotaUsage = await guard.usage();
		expect(usage.resetAt).toBe(new Date("2026-10-09T16:00:00Z").toISOString());
	});
});

function record(over: Partial<CostUsageRecord>): CostUsageRecord {
	return {
		userId: "u1",
		modelName: "glm-5.3-flash",
		inputTokens: 100,
		outputTokens: 50,
		estimatedCostMicros: 0,
		...over,
	} as CostUsageRecord;
}

describe("QuotaCountingCostStore（记账装饰器）", () => {
	test("适用用户：记账时累计额度并委托底层", async () => {
		const { guard, counter } = makeGuard({ now: baseNow });
		const inner: CostStorePort = {
			recordUsage: async () => {},
			aggregate: async () => [],
			listTopSpenders: async () => [],
		};
		let delegated = 0;
		inner.recordUsage = async () => { delegated++; };
		const store = new QuotaCountingCostStore(inner, guard);
		await store.recordUsage(record({}));
		expect(delegated).toBe(1);
		expect((await counter.get(`gd:demo:daily:20261009`))).toBe(150);
	});

	test("admin / BYOK / 零 token：不计数但仍委托底层", async () => {
		const admin = makeGuard({ now: baseNow, resolveRole: () => "admin" });
		const byok = makeGuard({ now: baseNow, resolveByok: async () => true });
		const inner: CostStorePort = {
			recordUsage: async () => {},
			aggregate: async () => [],
			listTopSpenders: async () => [],
		};
		let delegated = 0;
		inner.recordUsage = async () => { delegated++; };
		await new QuotaCountingCostStore(inner, admin.guard).recordUsage(record({}));
		await new QuotaCountingCostStore(inner, byok.guard).recordUsage(record({ inputTokens: 0, outputTokens: 0 }));
		expect(delegated).toBe(2);
		expect(await admin.counter.get("gd:demo:daily:20261009")).toBe(0);
		expect(await byok.counter.get("gd:demo:daily:20261009")).toBe(0);
	});
});

function hookContext(point: HookPoint, userId?: string): HookContext {
	return {
		sessionId: "sess-1",
		agentName: "TestAgent",
		metadata: userId ? { userId } : {},
	} as unknown as HookContext;
}

function runHook(hook: AgentHook, point: HookPoint, ctx: HookContext): Promise<HookContext> {
	return hook.onEvent(point, ctx);
}

describe("DemoQuotaHook（运行中额度守卫）", () => {
	test("额度耗尽：pre_reasoning 置 abort 与引导文案", async () => {
		const { guard } = makeGuard({ now: baseNow });
		await guard.record("u1", 1000);
		const hook = new DemoQuotaHook({ quota: guard, resolveUserId: () => "u1" });
		const ctx = hookContext("pre_reasoning", "u1");
		await runHook(hook, "pre_reasoning", ctx);
		expect(ctx.abort).toBe(true);
		expect(ctx.abortReason).toContain("免费额度已用完");
		expect(ctx.metadata.demoQuotaExceeded).toBe("true");
	});

	test("有余量：不 abort", async () => {
		const { guard } = makeGuard({ now: baseNow });
		const hook = new DemoQuotaHook({ quota: guard, resolveUserId: () => "u1" });
		const ctx = hookContext("pre_reasoning", "u1");
		await runHook(hook, "pre_reasoning", ctx);
		expect(ctx.abort).toBeFalsy();
	});

	test("admin / BYOK 用户不 abort；非 pre_reasoning 钩子点不处理", async () => {
		const admin = makeGuard({ now: baseNow, resolveRole: () => "admin" });
		await admin.guard.record("u1", 1000);
		const hook = new DemoQuotaHook({ quota: admin.guard, resolveUserId: () => "u1" });
		const ctx = hookContext("pre_reasoning", "u1");
		await runHook(hook, "pre_reasoning", ctx);
		expect(ctx.abort).toBeFalsy();

		const ok = makeGuard({ now: baseNow });
		const hook2 = new DemoQuotaHook({ quota: ok.guard, resolveUserId: () => "u1" });
		const ctx2 = hookContext("post_reasoning", "u1");
		await runHook(hook2, "post_reasoning", ctx2);
		expect(ctx2.abort).toBeFalsy();
	});
});
