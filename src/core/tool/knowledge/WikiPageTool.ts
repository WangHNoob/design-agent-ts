import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { FileSystemPort } from "../../../port/fs/FileSystemPort.js";
import { ToolDescriptor } from "../../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../port/tool/ToolResult.js";

export class WikiPageTool implements ToolPort {
  private cache = new Map<string, string>();

  constructor(
    private wikiPath: string,
    private fileSystem: FileSystemPort
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "wiki_page",
      description: "Wiki 知识库页面操作工具。支持读取页面、按主题查找页面路径、列出分类下的页面。",
      parameters: {
        action: {
          name: "action",
          type: "string",
          description: "操作类型: read(读取页面), lookup(查找页面路径), list(列出分类页面)",
          required: true,
          enum: ["read", "lookup", "list"],
        },
        pagePath: {
          name: "pagePath",
          type: "string",
          description: "页面路径（read 时用）",
          required: false,
        },
        topic: {
          name: "topic",
          type: "string",
          description: "主题关键词（lookup 时用）",
          required: false,
        },
        category: {
          name: "category",
          type: "string",
          description: "分类目录名（list 时用）",
          required: false,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action ?? "");
    try {
      switch (action) {
        case "read":
          return await this.read(String(args.pagePath ?? ""));
        case "lookup":
          return await this.lookup(String(args.topic ?? ""));
        case "list":
          return await this.list(String(args.category ?? ""));
        default:
          return ToolResult.error(`Unknown action: ${action}`);
      }
    } catch (err) {
      return ToolResult.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async read(pagePath: string): Promise<ToolResult> {
    if (!pagePath) {
      return ToolResult.error("pagePath is required for read action");
    }
    const cacheKey = `read:${pagePath}`;
    if (this.cache.has(cacheKey)) {
      return ToolResult.success(this.cache.get(cacheKey)!);
    }
    const fullPath = this.fileSystem.join(this.wikiPath, pagePath);
    const content = await this.fileSystem.readFile(fullPath);
    if (content === null) {
      return ToolResult.success(`Page not found: ${pagePath}`);
    }
    this.cache.set(cacheKey, content);
    return ToolResult.success(content);
  }

  private async lookup(topic: string): Promise<ToolResult> {
    if (!topic) {
      return ToolResult.error("topic is required for lookup action");
    }
    const normalizedTopic = topic.toLowerCase().replace(/\s+/g, "_");
    const entries = await this.fileSystem.readdir(this.wikiPath);
    const matches: string[] = [];
    for (const entry of entries) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        const baseName = entry.name.replace(/\.md$/, "").toLowerCase();
        if (baseName.includes(normalizedTopic) || normalizedTopic.includes(baseName)) {
          matches.push(entry.name);
        }
      }
    }
    if (matches.length === 0) {
      return ToolResult.success(`No wiki pages found for topic: ${topic}`);
    }
    return ToolResult.success(matches.join("\n"));
  }

  private async list(category: string): Promise<ToolResult> {
    const dirPath = category
      ? this.fileSystem.join(this.wikiPath, category)
      : this.wikiPath;
    const entries = await this.fileSystem.readdir(dirPath);
    const pages = entries
      .filter((e) => e.isFile && e.name.endsWith(".md"))
      .map((e) => (category ? `${category}/${e.name}` : e.name));
    if (pages.length === 0) {
      return ToolResult.success(`No wiki pages found in category: ${category || "root"}`);
    }
    return ToolResult.success(pages.join("\n"));
  }
}
