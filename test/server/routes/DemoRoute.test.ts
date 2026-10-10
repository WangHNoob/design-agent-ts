import { createHmac, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { Hono } from "hono";
import { demoRoute, setDemoRouteDependencies, type DemoRouteDependencies } from "../../../src/server/routes/demo.js";
import { DemoQuotaGuard } from "../../../src/core/cost/DemoQuotaGuard.js";
import type { QuotaCounterPort } from "../../../src/port/cost/QuotaCounterPort.js";
import type { BetterAuthAdapter } from "../../../src/adapter/betterauth/BetterAuthAdapter.js";

class MemoryCounter implements QuotaCounterPort {
	store = new Map<string, number>();
	async incr(key: string, delta: number): Promise<number> {
		const next = (this.store.get(key) ?? 0) + delta;
		this.store.set(key, next);
		return next;
	}
	async get(key: string): Promise<number> {
		return this.store.get(key) ?? 0;
	}
}

interface FakeUser { id: string; email: string; role: string }

function makeDeps(overrides: Partial<DemoRouteDependencies> = {}) {
	const users = new Map<string, FakeUser>();
	const calls: { method: string; body?: Record<string, unknown> }[] = [];
	const setCookieBatches: string[][] = [];

	const fakeApi = {
		signUpEmail: async ({ body }: { body: Record<string, unknown>; returnHeaders?: boolean }) => {
			calls.push({ method: "signUpEmail", body });
			const email = String(body.email);
			if (users.has(email)) throw new Error("already exists");
			users.set(email, { id: randomUUID(), email, role: "user" });
			return { user: users.get(email), headers: new Headers({ "set-cookie": "better-auth.session_token=signup-1; Path=/" }) };
		},
		signInEmail: async ({ body }: { body: Record<string, unknown>; returnHeaders?: boolean }) => {
			calls.push({ method: "signInEmail", body });
			const email = String(body.email);
			const user = users.get(email);
			// 与 Better Auth 一致：密码不匹配/账号不存在 → 抛错
			if (!user || body.password !== fakeApiPasswords.get(email)) {
				throw new Error("Invalid email or password");
			}
			return { user, headers: new Headers({ "set-cookie": "better-auth.session_token=signin-1; Path=/" }) };
		},
	};
	const fakeApiPasswords = new Map<string, string>();

	const auth = {
		auth: { api: fakeApi },
		getUserByEmail: async (email: string) => users.get(email) ?? null,
		updateUser: async (id: string, params: { role?: string }) => {
			for (const u of users.values()) {
				if (u.id === id && params.role) u.role = params.role;
			}
			return users.get(id) ?? null;
		},
	} as unknown as BetterAuthAdapter;

	const counter = new MemoryCounter();
	const quota = new DemoQuotaGuard({
		limitPerDay: 1000,
		counter,
		resolveRole: () => "user",
		resolveByok: async () => false,
		now: () => new Date("2026-10-09T10:00:00Z"),
	});

	const deps: DemoRouteDependencies = {
		auth,
		quota,
		enabled: true,
		adminEmail: "admin@test.local",
		anonEmailDomain: "demo.local",
		secret: "test-secret",
		counter,
		...overrides,
	};
	return { deps, users, calls, fakeApiPasswords, counter };
}

function buildApp() {
	const app = new Hono();
	app.route("/api/demo", demoRoute);
	return app;
}

beforeEach(() => {
	// setDemoRouteDependencies 在各用例内调用
});

describe("POST /api/demo/session（匿名自动登录）", () => {
	test("新浏览器：创建匿名账号并中继会话 cookie + 浏览器身份 cookie", async () => {
		const { deps, calls } = makeDeps();
		setDemoRouteDependencies(deps);
		const app = buildApp();

		const res = await app.request("/api/demo/session", { method: "POST" });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.mode).toBe("guest");

		// 匿名账号邮箱按浏览器 id 确定性派生
		expect(calls).toHaveLength(1);
		expect(calls[0]!.method).toBe("signUpEmail");
		const email = String(calls[0]!.body!.email);
		expect(email).toMatch(/^anon-[0-9a-f]{32}@demo\.local$/);
		// 密码 = HMAC(secret, browserId)，可离线复算（与重登路径一致）
		const browserId = res.headers.getSetCookie().find((c) => c.startsWith("demo_browser_id="))?.split(";")[0]?.split("=")[1]!;
		const expectPw = createHmac("sha256", "test-secret").update(`demo-anon:${browserId}`).digest("hex").slice(0, 32);
		expect(String(calls[0]!.body!.password)).toBe(expectPw);

		// 会话 cookie 与身份 cookie 都要种上
		const cookies = res.headers.getSetCookie();
		expect(cookies.some((c) => c.startsWith("better-auth.session_token=signup-1"))).toBe(true);
		expect(browserId).toMatch(/^[0-9a-f-]{36}$/i);
	});

	test("同一浏览器再次进入：复用账号走 signIn，密码可再次推导", async () => {
		const { deps, calls, fakeApiPasswords } = makeDeps();
		setDemoRouteDependencies(deps);
		const app = buildApp();

		const first = await app.request("/api/demo/session", { method: "POST" });
		const browserId = first.headers.getSetCookie().find((c) => c.startsWith("demo_browser_id="))?.split(";")[0]?.split("=")[1]!;
		const email = `anon-${browserId.replace(/-/g, "")}@demo.local`;
		// 注册时的密码即为后续 signIn 凭据（服务端可离线重派生）
		fakeApiPasswords.set(email, createHmac("sha256", "test-secret").update(`demo-anon:${browserId}`).digest("hex").slice(0, 32));

		const second = await app.request("/api/demo/session", {
			method: "POST",
			headers: { cookie: `demo_browser_id=${browserId}` },
		});
		expect(second.status).toBe(200);
		expect(calls.some((c) => c.method === "signInEmail" && c.body?.email === email)).toBe(true);
	});

	test("demo 关闭：404", async () => {
		const { deps } = makeDeps({ enabled: false });
		setDemoRouteDependencies(deps);
		const app = buildApp();
		const res = await app.request("/api/demo/session", { method: "POST" });
		expect(res.status).toBe(404);
	});
});

describe("POST /api/demo/owner-login（主人登录）", () => {
	function seedAdmin(bundle: ReturnType<typeof makeDeps>, password: string) {
		bundle.users.set("admin@test.local", { id: "admin-1", email: "admin@test.local", role: "user" });
		bundle.fakeApiPasswords.set("admin@test.local", password);
	}

	test("密码正确：签发管理员会话并纠偏 admin 角色", async () => {
		const bundle = makeDeps();
		seedAdmin(bundle, "owner-pass-1");
		setDemoRouteDependencies(bundle.deps);
		const app = buildApp();

		const res = await app.request("/api/demo/owner-login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "owner-pass-1" }),
		});
		expect(res.status).toBe(200);
		expect((await res.json()).mode).toBe("owner");
		expect(res.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=signin-1"))).toBe(true);
		expect(bundle.users.get("admin@test.local")?.role).toBe("admin");
	});

	test("密码错误：401 引导文案", async () => {
		const bundle = makeDeps();
		seedAdmin(bundle, "owner-pass-1");
		setDemoRouteDependencies(bundle.deps);
		const app = buildApp();

		const res = await app.request("/api/demo/owner-login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "wrong" }),
		});
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error).toBe("invalid_password");
		expect(body.message).toBe("密码不正确");
	});

	test("防爆破：10 分钟窗口内第 6 次起 429", async () => {
		const bundle = makeDeps();
		seedAdmin(bundle, "owner-pass-1");
		setDemoRouteDependencies(bundle.deps);
		const app = buildApp();

		for (let i = 0; i < 5; i++) {
			const res = await app.request("/api/demo/owner-login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: "nope" }),
			});
			expect(res.status).toBe(401);
		}
		const sixth = await app.request("/api/demo/owner-login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: "owner-pass-1" }),
		});
		expect(sixth.status).toBe(429);
		// 即使密码正确也被拒——限频按 IP 生效
		const body = await sixth.json();
		expect(body.error).toBe("rate_limited");
	});
});

describe("GET /api/demo/status（额度状态）", () => {
	test("额度守卫未注入时返回 enabled 无额度", async () => {
		const { deps } = makeDeps({ quota: null });
		setDemoRouteDependencies(deps);
		const app = buildApp();
		const res = await app.request("/api/demo/status");
		const body = await res.json();
		expect(body.enabled).toBe(true);
		expect(body.quotaEnabled).toBe(false);
	});

	test("返回用量与重置时间", async () => {
		const { deps } = makeDeps();
		setDemoRouteDependencies(deps);
		await deps.quota!.record("u1", 300);
		const app = buildApp();
		const res = await app.request("/api/demo/status");
		const body = await res.json();
		expect(body.quotaEnabled).toBe(true);
		expect(body.usedToday).toBe(300);
		expect(body.limit).toBe(1000);
		expect(body.remaining).toBe(700);
		expect(body.resetAt).toBe(new Date("2026-10-09T16:00:00Z").toISOString());
	});
});
