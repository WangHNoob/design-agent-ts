import { createHmac, randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { BetterAuthAdapter } from "../../adapter/betterauth/BetterAuthAdapter.js";
import type { QuotaCounterPort } from "../../port/cost/QuotaCounterPort.js";
import { DEMO_QUOTA_MESSAGE, type DemoQuotaGuard } from "../../core/cost/DemoQuotaGuard.js";

/**
 * 演示模式公开路由（/api/demo/*，免鉴权）：
 * - POST /session      访客自动登录：为当前浏览器创建/复用匿名演示账号并签发会话
 * - POST /owner-login  主人登录：校验管理员账号密码，成功即签发管理员会话
 * - GET  /status       免费额度用量（供前端 chip 展示）
 *
 * 匿名身份用 demo_browser_id cookie（1 年）稳定复用，密码由服务端
 * HMAC(secret, browserId) 确定性派生——无需存储、无法从 cookie 反推真实密码。
 */
export interface DemoRouteDependencies {
	auth: BetterAuthAdapter;
	quota: DemoQuotaGuard | null;
	/** 演示模式总开关（DEMO_MODE_ENABLED）。 */
	enabled: boolean;
	adminEmail: string;
	anonEmailDomain: string;
	/** better-auth secret，用于派生匿名账号密码。 */
	secret: string;
	/** IP 限频计数器（与额度计数共用基础设施）。 */
	counter: QuotaCounterPort;
}

let deps: DemoRouteDependencies | null = null;

export function setDemoRouteDependencies(next: DemoRouteDependencies): void {
	deps = next;
}

export const demoRoute = new Hono();

const BROWSER_COOKIE = "demo_browser_id";
const SESSION_IP_LIMIT = 6;          // 次/分钟
const OWNER_IP_LIMIT = 5;            // 次/10分钟（防爆破主人密码）
const MINUTE_MS = 60_000;

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
		|| c.req.header("x-real-ip")
		|| "local"
	);
}

function readCookie(header: string | undefined, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
	}
	return null;
}

/** 固定窗口 IP 限频；超限返回 false。 */
async function ipAllow(counter: QuotaCounterPort, ip: string, bucket: string, limit: number, windowMs: number): Promise<boolean> {
	const windowIndex = Math.floor(Date.now() / windowMs);
	const key = `gd:demo:ip:${bucket}:${ip}:${windowIndex}`;
	const n = await counter.incr(key, 1, windowMs * 2);
	return n <= limit;
}

function anonEmailFor(browserId: string, domain: string): string {
	return `anon-${browserId.replace(/-/g, "")}@${domain}`;
}

function anonPasswordFor(browserId: string, secret: string): string {
	return createHmac("sha256", secret).update(`demo-anon:${browserId}`).digest("hex").slice(0, 32);
}

/** 把 Better Auth 返回的 Set-Cookie 逐条中继给浏览器。 */
function relaySetCookies(c: { header(name: string, value: string, options?: { append?: boolean }): void }, headers: unknown): void {
	const getSetCookie = (headers as { getSetCookie?: () => string[] } | null | undefined)?.getSetCookie?.bind(headers);
	const cookies = typeof getSetCookie === "function" ? getSetCookie() : [];
	for (const cookie of cookies) {
		c.header("Set-Cookie", cookie, { append: true });
	}
}

demoRoute.post("/session", async (c) => {
	if (!deps?.enabled || !deps.counter) {
		return c.json({ error: "demo_disabled" }, 404);
	}
	const ip = clientIp(c);
	let allowed = true;
	try {
		allowed = await ipAllow(deps.counter, ip, "session", SESSION_IP_LIMIT, MINUTE_MS);
	} catch {
		allowed = true; // 限频后端故障不阻断演示入口
	}
	if (!allowed) {
		return c.json({ error: "rate_limited", message: "请求过于频繁，请稍后再试" }, 429);
	}

	let browserId = readCookie(c.req.header("cookie"), BROWSER_COOKIE);
	if (!browserId || !/^[0-9a-f-]{36}$/i.test(browserId)) {
		browserId = randomUUID();
	}
	const email = anonEmailFor(browserId, deps.anonEmailDomain);
	const password = anonPasswordFor(browserId, deps.secret);

	try {
		let headers: unknown = null;
		const existing = await deps.auth.getUserByEmail(email);
		if (!existing) {
			const result = await deps.auth.auth.api.signUpEmail({
				body: { email, password, name: "演示访客" },
				returnHeaders: true,
			});
			headers = result?.headers;
		} else {
			const result = await deps.auth.auth.api.signInEmail({
				body: { email, password },
				returnHeaders: true,
			});
			headers = result?.headers;
		}
		relaySetCookies(c, headers);
		// 浏览器身份 cookie：HttpOnly 服务端自用，1 年稳定复用同一匿名账号
		c.header("Set-Cookie", `${BROWSER_COOKIE}=${browserId}; Path=/; Max-Age=31536000; SameSite=Lax`, { append: true });
		return c.json({ ok: true, mode: "guest" });
	} catch (err) {
		console.error("[DemoRoute] 自动登录失败:", err instanceof Error ? err.message : String(err));
		return c.json({ error: "demo_session_failed", message: "演示会话创建失败，请刷新重试" }, 502);
	}
});

demoRoute.post("/owner-login", async (c) => {
	if (!deps?.enabled || !deps.counter) {
		return c.json({ error: "demo_disabled" }, 404);
	}
	const ip = clientIp(c);
	let allowed = true;
	try {
		allowed = await ipAllow(deps.counter, ip, "owner", OWNER_IP_LIMIT, 10 * MINUTE_MS);
	} catch {
		allowed = true;
	}
	if (!allowed) {
		return c.json({ error: "rate_limited", message: "尝试次数过多，请 10 分钟后再试" }, 429);
	}

	const body = await c.req.json<{ password?: string }>().catch(() => ({ password: "" }));
	const password = body.password ?? "";
	if (!password) {
		return c.json({ error: "invalid_password", message: "请输入密码" }, 401);
	}

	try {
		const result = await deps.auth.auth.api.signInEmail({
			body: { email: deps.adminEmail, password },
			returnHeaders: true,
		});
		relaySetCookies(c, result?.headers);
		// 防御性纠偏：账号存在但角色缺失时补 admin（正常由种子/域名规则保证）
		const user = await deps.auth.getUserByEmail(deps.adminEmail);
		if (user && user.role !== "admin") {
			await deps.auth.updateUser(user.id, { role: "admin" });
		}
		return c.json({ ok: true, mode: "owner" });
	} catch {
		return c.json({ error: "invalid_password", message: "密码不正确" }, 401);
	}
});

demoRoute.get("/status", async (c) => {
	if (!deps?.enabled) {
		return c.json({ enabled: false });
	}
	if (!deps.quota) {
		return c.json({ enabled: true, quotaEnabled: false });
	}
	const usage = await deps.quota.usage();
	return c.json({
		enabled: true,
		quotaEnabled: usage.limitPerDay > 0,
		usedToday: usage.usedToday,
		limit: usage.limitPerDay,
		remaining: usage.remaining,
		resetAt: usage.resetAt,
		// 引导文案仅在额度耗尽时携带（前端据此展示）
		...(usage.remaining <= 0 ? { message: DEMO_QUOTA_MESSAGE(usage) } : {}),
	});
});
