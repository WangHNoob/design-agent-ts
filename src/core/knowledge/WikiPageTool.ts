import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../port/tool/ToolResult.js";
import fs from "fs/promises";
import path from "path";

export class WikiPageTool implements ToolPort {
  private cache = new Map<string, string>();

  constructor(private wikiBasePath: string) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "wiki_read",
      description: "读取指定 Wiki 页面的完整内容",
      parameters: {
        path: {
          name: "path",
          type: "string",
          description: "Wiki 页面路径",
          required: true,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const pagePath = args.path as string;
    try {
      const cached = this.cache.get(pagePath);
      if (cached) return TR.success(cached);

      const fullPath = path.join(this.wikiBasePath, pagePath);
      const content = await fs.readFile(fullPath, "utf-8");
      this.cache.set(pagePath, content);
      return TR.success(content);
    } catch {
      return TR.error(`Wiki 页面不存在: ${pagePath}`);
    }
  }
}
