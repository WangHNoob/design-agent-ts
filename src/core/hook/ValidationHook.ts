import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";

export class ValidationHook implements AgentHook {
  priority = 200;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "post_reasoning") {
      const issues: string[] = [];

      // 1. Detect empty or blank agent output
      // For post_reasoning, the LLM response is in the last message, not in toolResult.
      const lastMsg = context.messages?.at(-1);
      const result = context.toolResult
        ?? (lastMsg ? ChatMessage.textContent(lastMsg) : "")
        ?? "";
      if (!result || result.trim().length === 0) {
        issues.push("Output content is empty");
      }

      // 2. Detect missing Markdown structure
      if (result && !result.includes("#")) {
        issues.push("Output missing Markdown headings");
      }

      // 3. Detect unrendered template placeholders
      if (result && /\\{[\\w_]+\\}/.test(result)) {
        issues.push("Output contains unrendered template placeholders");
      }

      // 4. Detect tool execution failures
      if (result && (result.includes("ERROR") || result.includes("error") || result.includes("Failed"))) {
        issues.push("Tool result indicates an error");
      }

      if (issues.length > 0) {
        console.warn(`[ValidationHook] ${context.agentName ?? "unknown"} issues: ${issues.join("; ")}`);
      }
    }

    return context;
  }
}
