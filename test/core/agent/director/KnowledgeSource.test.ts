import { describe, expect, test } from "vitest";
import { parseWeKnoraMetadata } from "../../../../src/core/agent/director/KnowledgeSource.js";

const ENVELOPE = {
  success: true,
  data: [
    {
      id: "chunk-1",
      content: "技能命中判定使用 d20 + 调整值，对抗目标护甲等级（AC）。",
      knowledge_id: "kn_001",
      knowledge_title: "03-战斗规则.md",
      knowledge_filename: "03-战斗规则.md",
      chunk_index: 2,
      score: 0.87,
      match_type: "hybrid",
    },
    {
      id: "chunk-2",
      content: "暴击规则：天然 20 触发暴击判定。",
      knowledge_id: "kn_001",
      chunk_index: 5,
      score: 0.64,
    },
  ],
};

describe("parseWeKnoraMetadata", () => {
  test("解析 structuredContent 信封（hybrid_search）", () => {
    const sources = parseWeKnoraMetadata("hybrid_search", { structuredContent: ENVELOPE }, "");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      type: "weknora_doc",
      id: "kn_001#chunk_2",
      title: "03-战斗规则.md",
      score: 0.87,
    });
    expect(sources[0].snippet).toContain("d20");
    expect(sources[1].title).toBeUndefined(); // 无标题字段时回退省略
  });

  test("文本通道双重编码 JSON 也能解包", () => {
    const raw = JSON.stringify(JSON.stringify(ENVELOPE));
    const sources = parseWeKnoraMetadata("wiki_search", {}, raw);
    expect(sources).toHaveLength(2);
    expect(sources[1].id).toBe("kn_001#chunk_5");
  });

  test("非检索工具 / 非法信封返回空数组", () => {
    expect(parseWeKnoraMetadata("get_knowledge", { structuredContent: ENVELOPE }, "")).toEqual([]);
    expect(parseWeKnoraMetadata("hybrid_search", {}, "not json")).toEqual([]);
    expect(parseWeKnoraMetadata("hybrid_search", { structuredContent: { success: false } }, "")).toEqual([]);
  });

  test("条目数截断到 8 条", () => {
    const big = { success: true, data: Array.from({ length: 20 }, (_, i) => ({ knowledge_id: `kn_${i}` })) };
    expect(parseWeKnoraMetadata("hybrid_search", { structuredContent: big }, "")).toHaveLength(8);
  });
});
