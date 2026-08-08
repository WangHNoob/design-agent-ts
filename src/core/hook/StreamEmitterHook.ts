import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { EventBus } from "../agent/director/EventBus.js";
import type { KnowledgeSource } from "../agent/director/DirectorAgent.js";
import { parseKnowledgeHubMetadata } from "../agent/director/KnowledgeSource.js";

/**
 * Hook that emits fine-grained execution events to an EventBus for real-time SSE streaming.
 * Priority: 200
 */
export class StreamEmitterHook implements AgentHook {
  readonly priority = 200;
  private spanStartTimes = new Map<string, number>();

  constructor(
    private eventBus: EventBus,
    private limits: { grepLimit?: number; webSourceLimit?: number } = {}
  ) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    const agentName = context.agentName ?? "unknown";
    const taskId = context.metadata?.taskId as string | undefined;

    switch (point) {
      case "pre_reasoning": {
        const key = this.getKey(context.sessionId, "reasoning");
        this.spanStartTimes.set(key, Date.now());

        this.eventBus.emit({
          type: "thinking",
          data: {
            agentName,
            taskId,
            iteration: context.iteration ?? 0,
            maxIterations: context.maxIterations ?? 0,
            message: `第 ${(context.iteration ?? 0) + 1}/${context.maxIterations ?? 0} 轮推理`,
          },
        });
        break;
      }

      case "pre_tool_execution": {
        const key = this.getKey(context.sessionId, context.toolName ?? "tool");
        this.spanStartTimes.set(key, Date.now());

        this.eventBus.emit({
          type: "tool_start",
          data: {
            agentName,
            taskId,
            toolName: context.toolName ?? "unknown",
            args: context.toolArguments ?? {},
          },
        });
        break;
      }

      case "post_tool_execution": {
        const toolName = context.toolName ?? "unknown";
        const key = this.getKey(context.sessionId, toolName);
        const startTime = this.spanStartTimes.get(key);
        const durationMs = startTime ? Date.now() - startTime : undefined;
        this.spanStartTimes.delete(key);

        const metadata = context.metadata?.toolResultMetadata as Record<string, unknown> | undefined;
        const rawResult = context.toolResult ?? "";
        const summary = this.summarizeToolResult(rawResult, metadata);

        this.eventBus.emit({
          type: "tool_complete",
          data: {
            agentName,
            taskId,
            toolName,
            durationMs,
            success: !this.isErrorResult(rawResult),
            summary,
            result: rawResult.length > 2000 ? rawResult.substring(0, 2000) + "...(truncated)" : rawResult,
          },
        });

        // Extract knowledge sources if this is a knowledge tool
        const sources = this.extractKnowledgeSources(toolName, context.toolResult ?? "", metadata);
        if (sources.length > 0) {
          this.eventBus.emit({
            type: "knowledge_used",
            data: {
              agentName,
              taskId,
              sourceType: this.getSourceType(toolName),
              sources,
            },
          });
        }
        break;
      }

      case "post_reasoning":
      case "pre_agent_call":
      case "post_agent_call":
      case "on_error":
      case "on_iteration_budget":
        // No events for these hook points
        break;
    }

    return context;
  }

  private getKey(sessionId: string | undefined, suffix: string): string {
    return `${sessionId ?? "unknown"}::${suffix}`;
  }

  private summarizeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!args) return {};

    // Truncate long string values for display
    const summarized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && value.length > 100) {
        summarized[key] = value.substring(0, 100) + "...";
      } else {
        summarized[key] = value;
      }
    }
    return summarized;
  }

  private summarizeToolResult(result: string, metadata?: Record<string, unknown>): string {
    // Prefer metadata summary if available
    if (metadata?.summary && typeof metadata.summary === "string") {
      return metadata.summary;
    }

    // Truncate long results (keep enough for meaningful debugging)
    if (result.length > 1000) {
      return result.substring(0, 1000) + "...";
    }
    return result;
  }

  private isErrorResult(result: string): boolean {
    return result.toLowerCase().includes("error") || result.toLowerCase().includes("failed");
  }

  private getSourceType(toolName: string): string {
    if (toolName.startsWith("kb_")) return "knowledge_hub";
    if (toolName.startsWith("wiki_")) return "wiki";
    if (toolName.startsWith("kg_")) return "kg";
    if (toolName === "grep_search") return "grep";
    if (toolName.startsWith("tavily_")) return "web";
    return "unknown";
  }

  private extractKnowledgeSources(
    toolName: string,
    result: string,
    metadata?: Record<string, unknown>
  ): KnowledgeSource[] {
    // kb_* 工具：从 structuredContent 解析知识来源
    if (toolName.startsWith("kb_")) {
      return parseKnowledgeHubMetadata(toolName, metadata || {});
    }

    const sources: KnowledgeSource[] = [];

    if (toolName.startsWith("wiki_")) {
      // Wiki tools: extract pagePath or matches from metadata
      if (metadata?.pagePath && typeof metadata.pagePath === "string") {
        sources.push({
          type: "wiki_page",
          id: metadata.pagePath,
          title: metadata.pagePath.split("/").pop(),
        });
      }
      if (metadata?.matches && Array.isArray(metadata.matches)) {
        for (const match of metadata.matches) {
          if (typeof match === "string") {
            sources.push({
              type: "wiki_page",
              id: match,
              title: match.split("/").pop(),
            });
          }
        }
      }
    } else if (toolName.startsWith("kg_")) {
      // Knowledge graph tools: extract node from metadata
      if (metadata?.node && typeof metadata.node === "string") {
        sources.push({
          type: "kg_node",
          id: metadata.node,
          title: metadata.node,
        });
      }
      if (metadata?.node_id && typeof metadata.node_id === "string") {
        sources.push({
          type: "kg_node",
          id: metadata.node_id,
          title: metadata.node_id,
        });
      }
    } else if (toolName === "grep_search") {
      // Grep: extract file paths from result
      const fileMatches = result.match(/File: ([^\n]+)/g);
      if (fileMatches) {
        for (const match of fileMatches.slice(0, this.limits.grepLimit ?? 5)) {
          const path = match.replace("File: ", "").trim();
          sources.push({
            type: "grep_match",
            id: path,
            title: path.split("/").pop() || path,
          });
        }
      }
    } else if (toolName.startsWith("tavily_")) {
      // Web search: extract URLs from result
      const urlMatches = result.match(/https?:\/\/[^\s)]+/g);
      if (urlMatches) {
        for (const url of urlMatches.slice(0, this.limits.webSourceLimit ?? 3)) {
          sources.push({
            type: "web_result",
            id: url,
            title: new URL(url).hostname,
          });
        }
      }
    }

    return sources;
  }
}
