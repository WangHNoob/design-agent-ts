import { describe, it, expect } from "vitest";
import { buildSessionContextBlock } from "../../../src/core/multiagent/sessionContext.js";

const LIMITS = { maxMessages: 20, maxChars: 6000 };

const history = (items: Array<[string, string]>) =>
  items.map(([role, content]) => ({
    role: role as "user" | "assistant",
    content,
  }));

describe("buildSessionContextBlock", () => {
  it("空历史 / undefined 返回空串", () => {
    expect(buildSessionContextBlock(undefined, LIMITS)).toBe("");
    expect(buildSessionContextBlock([], LIMITS)).toBe("");
  });

  it("maxMessages=0 或 maxChars=0 时关闭（kill-switch）", () => {
    const h = history([["user", "你好"]]);
    expect(buildSessionContextBlock(h, { maxMessages: 0, maxChars: 6000 })).toBe("");
    expect(buildSessionContextBlock(h, { maxMessages: 20, maxChars: 0 })).toBe("");
  });

  it("渲染角色标记并保留尾部 N 条", () => {
    const block = buildSessionContextBlock(
      history([
        ["user", "第一条"],
        ["assistant", "回复一"],
        ["user", "第二条"],
      ]),
      { maxMessages: 2, maxChars: 6000 },
    );
    expect(block).toContain("【用户】第二条");
    expect(block).toContain("【助手】回复一");
    expect(block).not.toContain("第一条");
    expect(block).toContain("已省略");
  });

  it("单条超长截断到 maxMessageChars 并加省略号", () => {
    const long = "A".repeat(2000);
    const block = buildSessionContextBlock(history([["user", long]]), {
      maxMessages: 20,
      maxChars: 6000,
      maxMessageChars: 800,
    });
    expect(block).toContain("…");
    expect(block).not.toContain("A".repeat(900));
  });

  it("总预算超限时从头部整条丢弃，保住最新内容", () => {
    const items = history([
      ["user", "旧".repeat(300)],
      ["user", "中".repeat(300)],
      ["user", "最新一条消息"],
    ]);
    // 三条渲染后 ~618 字符 > 400 预算：丢头部旧消息后 ~315+注释 ≤ 400
    const block = buildSessionContextBlock(items, { maxMessages: 20, maxChars: 400 });
    expect(block).toContain("最新一条消息");
    expect(block).toContain("已省略");
    expect(block).not.toContain("旧旧旧");
    expect(block.length).toBeLessThanOrEqual(400 + 200); // 预算 + 标头/脚注开销
  });

  it("非空块固定带优先级声明", () => {
    const block = buildSessionContextBlock(history([["user", "你好"]]), LIMITS);
    expect(block).toContain("历史仅作背景");
    expect(block).toContain("以任务需求为准");
  });
});
