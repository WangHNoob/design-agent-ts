import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { FileSystemPort } from "../../../port/fs/FileSystemPort.js";
import { ToolDescriptor } from "../../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../port/tool/ToolResult.js";

export class GrepSearchTool implements ToolPort {
  constructor(
    private wikiPath: string,
    private fileSystem: FileSystemPort
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "grep_search",
      description: "在 Wiki 知识库中全文检索关键词。遍历所有 .md 文件，返回包含匹配内容的文件路径及上下文片段。",
      parameters: {
        query: {
          name: "query",
          type: "string",
          description: "搜索关键词或正则表达式",
          required: true,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query ?? "");
    if (!query) {
      return ToolResult.error("query is required");
    }
    try {
      const results = await this.search(query);
      if (results.length === 0) {
        return ToolResult.success(`No matches found for: ${query}`);
      }
      return ToolResult.success(results.join("\n\n---\n\n"));
    } catch (err) {
      return ToolResult.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async search(query: string): Promise<string[]> {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const entries = await this.fileSystem.readdir(this.wikiPath);
    const results: string[] = [];

    for (const entry of entries) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const filePath = this.fileSystem.join(this.wikiPath, entry.name);
      const content = await this.fileSystem.readFile(filePath);
      if (content === null) continue;

      const lines = content.split("\n");
      const matches: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (regex.test(line)) {
          const contextStart = Math.max(0, i - 1);
          const contextEnd = Math.min(lines.length, i + 2);
          matches.push(`  L${i + 1}: ${lines.slice(contextStart, contextEnd).join("\n     ")}`);
        }
      }
      if (matches.length > 0) {
        results.push(`File: ${entry.name}\n${matches.join("\n")}`);
      }
    }
    return results;
  }
}
