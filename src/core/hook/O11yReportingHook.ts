import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { startSpan, endSpan, failSpan } from "../o11y/O11yTraceBridge.js";
import type { O11ySpan } from "../o11y/O11ySpan.js";

const spanMap = new Map<string, O11ySpan>();

function spanKey(sessionId: string | undefined, point: string): string {
  return `${sessionId ?? "unknown"}::${point}`;
}

export class O11yReportingHook implements AgentHook {
  readonly priority: number;

  constructor(priority = 100) {
    this.priority = priority;
  }

  async onEvent(point: HookPoint, ctx: HookContext): Promise<HookContext> {
    const sessionId = ctx.sessionId ?? "unknown";
    const key = spanKey(sessionId, point);

    switch (point) {
      case "pre_agent_call": {
        const span = startSpan(ctx.agentName ?? "agent", "AGENT_CHAIN", null, {
          messages: ctx.messages?.map((m) => ({ role: m.role, name: m.name })),
        });
        spanMap.set(key, span);
        break;
      }
      case "post_agent_call": {
        const span = spanMap.get(key);
        if (span) {
          spanMap.delete(key);
          endSpan(span, { messageCount: ctx.messages?.length });
        }
        break;
      }
      case "pre_reasoning": {
        const span = startSpan(ctx.agentName ?? "llm", "LLM", null, {
          iteration: ctx.iteration,
          maxIterations: ctx.maxIterations,
        });
        spanMap.set(key, span);
        break;
      }
      case "post_reasoning": {
        const span = spanMap.get(key);
        if (span) {
          spanMap.delete(key);
          endSpan(span, { messageCount: ctx.messages?.length });
        }
        break;
      }
      case "pre_tool_execution": {
        const span = startSpan(ctx.toolName ?? "tool", "TOOL", null, {
          arguments: ctx.toolArguments,
        });
        spanMap.set(key, span);
        break;
      }
      case "post_tool_execution": {
        const span = spanMap.get(key);
        if (span) {
          spanMap.delete(key);
          endSpan(span, { result: ctx.toolResult });
        }
        break;
      }
      case "on_error": {
        // Try to fail any in-flight span for this session
        const agentKey = spanKey(sessionId, "pre_agent_call");
        const reasoningKey = spanKey(sessionId, "pre_reasoning");
        const toolKey = spanKey(sessionId, "pre_tool_execution");
        for (const k of [agentKey, reasoningKey, toolKey]) {
          const span = spanMap.get(k);
          if (span) {
            spanMap.delete(k);
            failSpan(span, ctx.error?.message ?? "Unknown error");
          }
        }
        break;
      }
      case "on_iteration_budget": {
        // No span, just a warning event
        break;
      }
    }

    return ctx;
  }
}
