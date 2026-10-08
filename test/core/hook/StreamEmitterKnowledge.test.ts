import { describe, expect, test } from "vitest";
import { StreamEmitterHook } from "../../../src/core/hook/StreamEmitterHook.js";
import { EventBus } from "../../../src/core/agent/director/EventBus.js";
import { HookContext } from "../../../src/port/hook/HookContext.js";

/** 与真实 WeKnora hybrid_search 返回一致的信封（text 通道单编码 JSON） */
const WEKNORA_TEXT = JSON.stringify({
  success: true,
  data: [
    {
      id: "chunk-1",
      content: "技能命中判定使用 d20 + 调整值，对抗目标护甲等级（AC）。".repeat(6),
      knowledge_id: "kn_001",
      knowledge_title: "03-战斗规则.md",
      knowledge_filename: "03-战斗规则.md",
      chunk_index: 2,
      score: 0.914,
      match_type: "hybrid",
    },
  ],
});

class CapturingBus extends EventBus {
  readonly seen: Array<{ type: string; data: unknown }> = [];
  emit(event: { type: string; data: unknown }): void {
    this.seen.push(event);
  }
}

describe("StreamEmitterHook → knowledge_used（WeKnora 证据流）", () => {
  test("hybrid_search 文本结果（经 adapter 双重编码）触发 knowledge_used 并携带来源", async () => {
    const bus = new CapturingBus();
    const hook = new StreamEmitterHook(bus);

    // LangGraphAgentAdapter 以 JSON.stringify(content) 回填 toolResult
    await hook.onEvent(
      "post_tool_execution",
      HookContext.create({
        agentName: "QueryAgent",
        sessionId: "s1",
        toolName: "hybrid_search",
        toolResult: JSON.stringify(WEKNORA_TEXT),
        metadata: {},
      }),
    );

    const used = bus.seen.find((e) => e.type === "knowledge_used");
    expect(used).toBeDefined();
    const data = used!.data as {
      sourceType: string;
      sources: Array<{ type: string; id: string; title?: string; score?: number; snippet?: string }>;
    };
    expect(data.sourceType).toBe("weknora");
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0]).toMatchObject({
      type: "weknora_doc",
      id: "kn_001#chunk_2",
      title: "03-战斗规则.md",
      score: 0.914,
    });
    expect(data.sources[0].snippet!.length).toBeLessThanOrEqual(160);
  });

  test("非检索工具不触发 knowledge_used", async () => {
    const bus = new CapturingBus();
    const hook = new StreamEmitterHook(bus);
    await hook.onEvent(
      "post_tool_execution",
      HookContext.create({
        agentName: "QueryAgent",
        sessionId: "s1",
        toolName: "get_knowledge",
        toolResult: JSON.stringify(WEKNORA_TEXT),
        metadata: {},
      }),
    );
    expect(bus.seen.some((e) => e.type === "knowledge_used")).toBe(false);
  });
});
