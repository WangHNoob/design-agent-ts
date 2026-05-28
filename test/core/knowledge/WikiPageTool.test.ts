import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { WikiPageTool } from "../../../src/core/knowledge/WikiPageTool.js";

const TEST_WIKI_DIR = "test-wiki-temp";

describe("WikiPageTool", () => {
  let tool: WikiPageTool;

  beforeEach(async () => {
    await fs.mkdir(TEST_WIKI_DIR, { recursive: true });
    await fs.writeFile(path.join(TEST_WIKI_DIR, "combat.md"), "# Combat System\n\nDetails here.");
    tool = new WikiPageTool(TEST_WIKI_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_WIKI_DIR, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("应读取存在的 wiki 页面", async () => {
    const result = await tool.execute({ path: "combat.md" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Combat System");
  });

  it("不存在的页面应返回错误", async () => {
    const result = await tool.execute({ path: "nonexistent.md" });
    expect(result.isError).toBe(true);
    expect(result.output).toContain("不存在");
  });

  it("缓存命中应直接返回缓存内容", async () => {
    await tool.execute({ path: "combat.md" });
    const result = await tool.execute({ path: "combat.md" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Combat System");
  });
});
