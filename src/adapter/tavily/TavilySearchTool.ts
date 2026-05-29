import type { ToolPort } from "../../port/tool/ToolPort.js";
import { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
const NO_KEY_MSG = "⚠️ 未配置 Tavily API Key，请在设置页面配置后重试。获取免费 Key: https://tavily.com";

export class TavilySearchTool implements ToolPort {
  private apiKey: string | null = null;

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey && apiKey.trim() ? apiKey.trim() : null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  getDescriptor(): ToolDescriptor {
    return {
      name: "tavily_search",
      description: "联网搜索引擎。用于查询最新资讯、时事、数据等知识库之外的信息。支持 tavily-search（搜索）和 tavily-extract（抓取网页）。",
      parameters: {
        action: {
          name: "action",
          type: "string",
          description: "操作类型: search, extract",
          required: true,
          enum: ["search", "extract"],
        },
        query: {
          name: "query",
          type: "string",
          description: "搜索查询或提取问题",
          required: false,
        },
        urls: {
          name: "urls",
          type: "string",
          description: "要抓取的 URL 列表，逗号分隔（extract 时用）",
          required: false,
        },
        max_results: {
          name: "max_results",
          type: "number",
          description: "返回结果数量，默认 5，最大 20",
          required: false,
          defaultValue: 5,
        },
        search_depth: {
          name: "search_depth",
          type: "string",
          description: "搜索深度: basic(快速) 或 advanced(深度)",
          required: false,
          defaultValue: "basic",
          enum: ["basic", "advanced"],
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action ?? "");
    if (!this.apiKey) {
      return ToolResult.success(NO_KEY_MSG);
    }
    try {
      switch (action) {
        case "search":
          return await this.search(
            String(args.query ?? ""),
            Number(args.max_results ?? 5),
            String(args.search_depth ?? "basic")
          );
        case "extract":
          return await this.extract(String(args.urls ?? ""), String(args.query ?? ""));
        default:
          return ToolResult.error(`Unknown action: ${action}`);
      }
    } catch (err) {
      return ToolResult.error(err instanceof Error ? err.message : String(err));
    }
  }

  private async search(query: string, maxResults: number, searchDepth: string): Promise<ToolResult> {
    if (!query) return ToolResult.error("query is required for search");
    const body = {
      api_key: this.apiKey,
      query,
      max_results: Math.min(Math.max(maxResults, 1), 20),
      search_depth: searchDepth === "advanced" ? "advanced" : "basic",
      include_answer: true,
    };

    const res = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return ToolResult.error(`Tavily API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score?: number }>;
    };

    const lines: string[] = [];
    if (data.answer) {
      lines.push(`Answer: ${data.answer}\n`);
    }
    if (data.results && data.results.length > 0) {
      lines.push("Results:");
      for (const r of data.results) {
        lines.push(`- ${r.title}\n  URL: ${r.url}\n  Content: ${r.content.substring(0, 300)}${r.content.length > 300 ? "..." : ""}`);
      }
    }

    return ToolResult.success(lines.join("\n") || "No results found.", { resultCount: data.results?.length ?? 0 });
  }

  private async extract(urls: string, extractQuery: string): Promise<ToolResult> {
    if (!urls) return ToolResult.error("urls is required for extract");
    const urlList = urls.split(",").map((u) => u.trim()).filter(Boolean);
    if (urlList.length === 0) return ToolResult.error("urls is required for extract");

    const body = {
      api_key: this.apiKey,
      urls: urlList,
      query: extractQuery || undefined,
      include_images: false,
    };

    const res = await fetch(TAVILY_EXTRACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return ToolResult.error(`Tavily Extract API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json() as {
      results?: Array<{ url: string; raw_content?: string; extracted_content?: string }>;
    };

    const lines: string[] = [];
    if (data.results) {
      for (const r of data.results) {
        lines.push(`URL: ${r.url}\n${r.raw_content ?? r.extracted_content ?? "No content extracted"}`);
      }
    }

    return ToolResult.success(lines.join("\n\n---\n\n") || "No content extracted.");
  }
}
