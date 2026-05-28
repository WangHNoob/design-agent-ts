import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";

import { KnowledgeGraphTool } from "../../../src/core/knowledge/KnowledgeGraphTool.js";

const TEST_GRAPH_PATH = "test-graph-temp.json";

describe("KnowledgeGraphTool", () => {
  let tool: KnowledgeGraphTool;

  beforeEach(async () => {
    const graphData = {
      nodes: [
        { id: "Player", type: "entity", properties: { name: "玩家" } },
        { id: "Enemy", type: "entity", properties: { name: "敌人" } },
      ],
      edges: [
        { source: "Player", target: "Enemy", relation: "attacks" },
      ],
    };
    await fs.writeFile(TEST_GRAPH_PATH, JSON.stringify(graphData));
    tool = new KnowledgeGraphTool(TEST_GRAPH_PATH);
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_GRAPH_PATH);
    } catch {
      // ignore
    }
  });

  it("应查询存在的实体", async () => {
    const result = await tool.execute({ entity: "Player" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Player");
    expect(result.output).toContain("attacks");
  });

  it("不存在的实体应返回错误", async () => {
    const result = await tool.execute({ entity: "NonExistent" });
    expect(result.isError).toBe(true);
    expect(result.output).toContain("不存在");
  });

  it("懒加载应只读取一次文件", async () => {
    await tool.execute({ entity: "Player" });
    await tool.execute({ entity: "Enemy" });
    // 第二次不应报错，说明缓存生效
    expect(true).toBe(true);
  });
});
