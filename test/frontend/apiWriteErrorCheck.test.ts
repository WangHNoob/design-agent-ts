import { afterEach, describe, expect, test, vi } from "vitest";
import { savePrompt, saveSkill, saveWorkflow, saveSettings } from "../../frontend/lib/api.js";

/**
 * 回归背景：访客保存提示词被后端 403 拒绝，但 api 函数不检查 res.ok，
 * 错误体被当成功返回，UI 弹"保存成功"（假成功）。此组测试锁死写操作
 * 必须在非 2xx 时抛错，并优先透传后端的中文 message。
 */
function mockFetchOnce(status: number, body: unknown) {
	vi.stubGlobal("fetch", vi.fn(async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		}),
	));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("api 写操作错误检查（防假成功回归）", () => {
	test("savePrompt 遇 403 抛错并透传后端 message", async () => {
		mockFetchOnce(403, { error: "Forbidden: admin access required" });
		await expect(savePrompt("planner", "hacked")).rejects.toThrow(/403|admin/);
	});

	test("saveSkill 遇 403 抛错", async () => {
		mockFetchOnce(403, { error: "Forbidden" });
		await expect(saveSkill("test-skill", "x")).rejects.toThrow();
	});

	test("saveWorkflow 遇 403 抛错", async () => {
		mockFetchOnce(403, { error: "Forbidden" });
		await expect(
			saveWorkflow("test-wf", { name: "t", description: "t", keywords: [], tasks: [] }),
		).rejects.toThrow();
	});

	test("saveSettings 遇 403 抛错", async () => {
		mockFetchOnce(403, { error: "Forbidden" });
		await expect(saveSettings({ modelApiKey: "x" })).rejects.toThrow();
	});

	test("message 字段优先于错误码文案（429 额度引导）", async () => {
		mockFetchOnce(429, { error: "DEMO_QUOTA_EXCEEDED", message: "今日免费额度已用完" });
		await expect(savePrompt("a", "b")).rejects.toThrow("今日免费额度已用完");
	});

	test("2xx 正常返回数据", async () => {
		mockFetchOnce(200, { success: true, isNew: false });
		await expect(savePrompt("a", "b")).resolves.toMatchObject({ success: true });
	});
});
