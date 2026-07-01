import { describe, it, expect } from "vitest";
import { InMemoryBlackboard } from "../../../src/core/blackboard/InMemoryBlackboard.js";
import { BlackboardStore } from "../../../src/core/blackboard/BlackboardStore.js";
import { CachingToolWrapper, makeCacheKey } from "../../../src/core/tool/CachingToolWrapper.js";
import { CachingToolRegistry } from "../../../src/core/tool/CachingToolRegistry.js";
import { BlackboardTool } from "../../../src/core/tool/BlackboardTool.js";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import type { ToolRegistry } from "../../../src/port/tool/ToolRegistry.js";

/** 可控时钟，便于测试 TTL 过期。 */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** 记录调用次数的桩工具。 */
class CountingTool implements ToolPort {
  callCount = 0;
  constructor(
    private readonly name: string,
    private readonly behavior: (args: Record<string, unknown>) => ToolResult
  ) {}
  getDescriptor(): ToolDescriptor {
    return { name: this.name, description: "stub", parameters: {} };
  }
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    this.callCount++;
    return this.behavior(args);
  }
}

describe("InMemoryBlackboard", () => {
  it("write 后可 read 出同一内容", () => {
    const bb = new InMemoryBlackboard();
    bb.write("k1", "v1", "src", "agentA", 300);
    expect(bb.read("k1")?.value).toBe("v1");
    expect(bb.read("k1")?.agentType).toBe("agentA");
  });

  it("同 key 写入覆盖旧值", () => {
    const bb = new InMemoryBlackboard();
    bb.write("k", "old", "s", "a", 300);
    bb.write("k", "new", "s", "a", 300);
    expect(bb.read("k")?.value).toBe("new");
    expect(bb.size()).toBe(1);
  });

  it("超过 TTL 后读取返回 undefined 并清除", () => {
    const clock = fakeClock();
    const bb = new InMemoryBlackboard(clock.now);
    bb.write("k", "v", "s", "a", 10); // 10s
    clock.advance(9_000);
    expect(bb.read("k")?.value).toBe("v");
    clock.advance(2_000); // 共 11s，已过期
    expect(bb.read("k")).toBeUndefined();
    expect(bb.size()).toBe(0);
  });

  it("search 对 key 与 value 做大小写不敏感匹配", () => {
    const bb = new InMemoryBlackboard();
    bb.write("combat:dmg", "伤害公式 ATK*2", "s", "a", 300);
    bb.write("econ:gold", "金币产出", "s", "a", 300);
    expect(bb.search("COMBAT").length).toBe(1);
    expect(bb.search("公式").length).toBe(1);
    expect(bb.search("无关").length).toBe(0);
  });

  it("listRecent 按 createdAt 倒序并受 n 限制", () => {
    const clock = fakeClock();
    const bb = new InMemoryBlackboard(clock.now);
    bb.write("a", "1", "s", "a", 300);
    clock.advance(10);
    bb.write("b", "2", "s", "a", 300);
    clock.advance(10);
    bb.write("c", "3", "s", "a", 300);
    const recent = bb.listRecent(2);
    expect(recent.map((e) => e.key)).toEqual(["c", "b"]);
  });

  it("evictExpired 清除过期项", () => {
    const clock = fakeClock();
    const bb = new InMemoryBlackboard(clock.now);
    bb.write("k", "v", "s", "a", 10);
    clock.advance(20_000);
    bb.evictExpired();
    expect(bb.size()).toBe(0);
  });
});

describe("makeCacheKey", () => {
  it("参数顺序不影响缓存键", () => {
    expect(makeCacheKey("t", { a: 1, b: 2 })).toBe(makeCacheKey("t", { b: 2, a: 1 }));
  });
  it("不同参数生成不同键", () => {
    expect(makeCacheKey("t", { q: "x" })).not.toBe(makeCacheKey("t", { q: "y" }));
  });
});

describe("CachingToolWrapper", () => {
  it("相同参数第二次命中缓存，base 仅执行一次", async () => {
    const bb = new InMemoryBlackboard();
    const base = new CountingTool("search", () => ToolResult.success("RESULT"));
    const wrapped = new CachingToolWrapper(base, bb, 300, "agentA");

    const r1 = await wrapped.execute({ q: "x" });
    const r2 = await wrapped.execute({ q: "x" });

    expect(base.callCount).toBe(1);
    expect(r1.output).toBe("RESULT");
    expect(r2.output).toContain("RESULT");
    expect(r2.metadata.fromCache).toBe(true);
  });

  it("不同参数不命中缓存", async () => {
    const bb = new InMemoryBlackboard();
    const base = new CountingTool("search", (a) => ToolResult.success(`R:${a.q}`));
    const wrapped = new CachingToolWrapper(base, bb, 300, "agentA");
    await wrapped.execute({ q: "x" });
    await wrapped.execute({ q: "y" });
    expect(base.callCount).toBe(2);
  });

  it("错误结果不写入缓存", async () => {
    const bb = new InMemoryBlackboard();
    const base = new CountingTool("search", () => ToolResult.error("boom"));
    const wrapped = new CachingToolWrapper(base, bb, 300, "agentA");
    await wrapped.execute({ q: "x" });
    await wrapped.execute({ q: "x" });
    expect(base.callCount).toBe(2);
    expect(bb.size()).toBe(0);
  });

  it("跨工具实例共享黑板：第二个 wrapper 命中第一个写入的缓存", async () => {
    const bb = new InMemoryBlackboard();
    const baseA = new CountingTool("search", () => ToolResult.success("FROM_A"));
    const baseB = new CountingTool("search", () => ToolResult.success("FROM_B"));
    const wA = new CachingToolWrapper(baseA, bb, 300, "agentA");
    const wB = new CachingToolWrapper(baseB, bb, 300, "agentB");

    await wA.execute({ q: "x" });
    const r = await wB.execute({ q: "x" });

    expect(baseB.callCount).toBe(0);
    expect(r.output).toContain("FROM_A");
  });
});

describe("CachingToolRegistry", () => {
  function baseRegistry(tools: ToolPort[]): ToolRegistry {
    const map = new Map(tools.map((t) => [t.getDescriptor().name, t]));
    return {
      register() {},
      getToolDescriptors: () => tools.map((t) => t.getDescriptor()),
      getTool: (n) => map.get(n),
      executeTool: async (n, a) => map.get(n)?.execute(a) ?? ToolResult.error("nf"),
    };
  }

  it("白名单工具被包裹缓存，非白名单原样透传", async () => {
    const bb = new InMemoryBlackboard();
    const cached = new CountingTool("tavily_search", () => ToolResult.success("WEB"));
    const plain = new CountingTool("wiki_read", () => ToolResult.success("WIKI"));
    const reg = new CachingToolRegistry(
      baseRegistry([cached, plain]),
      bb,
      new Set(["tavily_search"]),
      300,
      new Map([["tavily_search", 600]]),
      "agentA"
    );

    const t1 = reg.getTool("tavily_search")!;
    await t1.execute({ q: "x" });
    await reg.getTool("tavily_search")!.execute({ q: "x" });
    expect(cached.callCount).toBe(1); // 命中缓存

    expect(reg.getTool("wiki_read")).toBe(plain); // 未包裹
  });
});

describe("BlackboardStore", () => {
  it("同 session 复用同一块黑板，不同 session 隔离", () => {
    const store = new BlackboardStore();
    const a1 = store.getOrCreate("s1");
    a1.write("k", "v", "s", "a", 300);
    expect(store.getOrCreate("s1").read("k")?.value).toBe("v");
    expect(store.getOrCreate("s2").read("k")).toBeUndefined();
  });

  it("evictAll 清理所有会话过期项", () => {
    const clock = fakeClock();
    const store = new BlackboardStore(clock.now);
    store.getOrCreate("s1").write("k", "v", "s", "a", 10);
    clock.advance(20_000);
    store.evictAll();
    expect(store.getOrCreate("s1").size()).toBe(0);
  });
});

describe("BlackboardTool", () => {
  it("write 后 read 可取回", async () => {
    const bb = new InMemoryBlackboard();
    const tool = new BlackboardTool(bb, "CombatDesigner", 300);
    await tool.execute({ action: "write", key: "dmg", value: "ATK*2" });
    const r = await tool.execute({ action: "read", key: "dmg" });
    expect(r.output).toBe("ATK*2");
  });

  it("search 返回带 agentType 前缀的摘要", async () => {
    const bb = new InMemoryBlackboard();
    const tool = new BlackboardTool(bb, "CombatDesigner", 300);
    await tool.execute({ action: "write", key: "dmg", value: "伤害公式" });
    const r = await tool.execute({ action: "search", keyword: "dmg" });
    expect(r.output).toContain("[CombatDesigner] dmg:");
  });

  it("write 缺少参数返回错误", async () => {
    const bb = new InMemoryBlackboard();
    const tool = new BlackboardTool(bb, "a", 300);
    const r = await tool.execute({ action: "write", key: "k" });
    expect(r.isError).toBe(true);
  });

  it("未知 action 返回错误", async () => {
    const bb = new InMemoryBlackboard();
    const tool = new BlackboardTool(bb, "a", 300);
    const r = await tool.execute({ action: "nope" });
    expect(r.isError).toBe(true);
  });
});
