import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../port/tool/ToolResult.js";
import fs from "fs/promises";
import path from "path";

export class GrepSearchTool implements ToolPort {
  constructor(private searchBasePath: string) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "grep_search",
      description: "在知识库中进行全文本搜索",
      parameters: {
        query: {
          name: "query",
          type: "string",
          description: "搜索关键词",
          required: true,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = (args.query as string).toLowerCase();
    const results: Array<{ file: string; line: number; content: string }> = [];

    try {
      await this.searchDir(this.searchBasePath, query, results, "");
      return TR.success(JSON.stringify(results.slice(0, 20), null, 2));
    } catch (err) {
      return TR.error(`搜索失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async searchDir(
    dirPath: string,
    query: string,
    results: Array<{ file: string; line: number; content: string }>,
    relativePrefix: string
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await this.searchDir(fullPath, query, results, relativePath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const content = await fs.readFile(fullPath, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(query)) {
            results.push({ file: relativePath, line: idx + 1, content: line.trim() });
          }
        });
      }
    }
  }
}
