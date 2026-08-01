import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import {
  parseKnowledgeHubMetadata,
  type KnowledgeSource,
} from "../agent/director/KnowledgeSource.js";

/**
 * Enforces Knowledge Hub flywheel write-back without relying on prompt compliance:
 * - empty/miss kb_search → kb_report_gap
 * - post_agent_call → kb_submit_attribution with accumulated traces
 */
export class KnowledgeFlywheelHook implements AgentHook {
  readonly priority = 210;
  private readonly sourcesBySession = new Map<string, KnowledgeSource[]>();
  private readonly reportedKeys = new Set<string>();

  constructor(private readonly tools: ToolRegistry) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    const sessionId = context.sessionId ?? "unknown";
    if (point === "post_tool_execution") {
      await this.onToolComplete(sessionId, context);
    } else if (point === "post_agent_call") {
      await this.onAgentComplete(sessionId, context);
    }
    return context;
  }

  private async onToolComplete(sessionId: string, context: HookContext): Promise<void> {
    const toolName = context.toolName ?? "";
    if (!toolName.startsWith("kb_")) return;
    if (toolName.startsWith("kb_report_") || toolName === "kb_submit_attribution") return;

    const metadata = context.metadata?.toolResultMetadata as Record<string, unknown> | undefined;
    const sources = parseKnowledgeHubMetadata(toolName, metadata ?? {});
    if (sources.length > 0) {
      const list = this.sourcesBySession.get(sessionId) ?? [];
      list.push(...sources);
      this.sourcesBySession.set(sessionId, list);
    }

    if (toolName !== "kb_search" && toolName !== "kb_resolve_topic") return;
    const structured = metadata?.structuredContent as Record<string, unknown> | undefined;
    const trace = structured?.trace as Record<string, unknown> | undefined;
    const componentIds = Array.isArray(trace?.componentIds) ? trace.componentIds.map(String) : [];
    const isMiss = componentIds.length === 0 || this.isErrorResult(context.toolResult ?? "");
    if (!isMiss) return;

    const query = String(
      context.toolArguments?.query
        ?? context.toolArguments?.q
        ?? context.toolArguments?.topic
        ?? "",
    ).trim();
    if (!query) return;
    const key = `${sessionId}::gap::${query}`;
    if (this.reportedKeys.has(key)) return;
    this.reportedKeys.add(key);

    await this.safeCall("kb_report_gap", {
      query,
      reason: "automatic_miss_from_agent_runtime",
      note: `Triggered by ${toolName} with empty componentIds`,
    });
  }

  private async onAgentComplete(sessionId: string, context: HookContext): Promise<void> {
    const sources = this.sourcesBySession.get(sessionId) ?? [];
    this.sourcesBySession.delete(sessionId);
    if (sources.length === 0) return;

    const releaseId = sources.find((s) => s.release?.releaseId)?.release?.releaseId;
    const componentIds = unique(sources.map((s) => s.id).filter(Boolean));
    const evidenceIds = unique(
      sources.flatMap((s) => s.evidence?.evidenceIds ?? []).filter(Boolean),
    );
    const summaryText = sources
      .slice(0, 12)
      .map((s) => `${s.title ?? s.id} (trust=${s.trust?.score ?? "n/a"})`)
      .join("; ");

    await this.safeCall("kb_submit_attribution", {
      releaseId,
      title: `design-agent session ${sessionId}`,
      componentIds,
      evidenceIds,
      segments: [
        {
          text: summaryText || `Agent session ${sessionId} used Knowledge Hub tools.`,
          trace: {
            releaseId,
            componentIds,
            evidenceIds,
          },
        },
      ],
      sessionId,
      agentRole: context.agentName ?? "design-agent",
    });
  }

  private async safeCall(toolName: string, args: Record<string, unknown>): Promise<void> {
    try {
      if (!this.tools.getTool(toolName)) {
        return;
      }
      await this.tools.executeTool(toolName, args);
    } catch (error) {
      console.warn(`[KnowledgeFlywheelHook] ${toolName} failed:`, error instanceof Error ? error.message : error);
    }
  }

  private isErrorResult(result: string): boolean {
    const lower = result.toLowerCase();
    return lower.includes("no current published release") || lower.includes("\"status\": \"miss\"");
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
