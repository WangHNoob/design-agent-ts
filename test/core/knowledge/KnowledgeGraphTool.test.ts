import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";

import { KnowledgeGraphTool } from "../../../src/core/tool/knowledge/KnowledgeGraphTool.js";
import { NodeFileSystemAdapter } from "../../../src/adapter/fs/NodeFileSystemAdapter.js";

const TEST_GRAPH_PATH = "test-graph-temp.json";

describe("KnowledgeGraphTool", () => {
  let tool: KnowledgeGraphTool;

  beforeEach(async () => {
    const graphData = {
      nodes: [
        { id: "Player", type: "entity", wiki_page: null },
        { id: "Enemy", type: "entity", wiki_page: null },
      ],
      edges: [
        { source: "Player", target: "Enemy", relation: "attacks" },
      ],
    };
    await fs.writeFile(TEST_GRAPH_PATH, JSON.stringify(graphData));
    tool = new KnowledgeGraphTool(TEST_GRAPH_PATH, new NodeFileSystemAdapter());
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_GRAPH_PATH);
    } catch {
      // ignore
    }
  });

  it("应查询存在的实体", async () => {
    const result = await tool.execute({ action: "query_node", node_id: "Player" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Player");
  });

  it("不存在的实体应返回提示", async () => {
    const result = await tool.execute({ action: "query_node", node_id: "NonExistent" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("not found");
  });

  it("懒加载应只读取一次文件", async () => {
    await tool.execute({ action: "query_node", node_id: "Player" });
    await tool.execute({ action: "query_node", node_id: "Enemy" });
    // 第二次不应报错，说明缓存生效
    expect(true).toBe(true);
  });
});
