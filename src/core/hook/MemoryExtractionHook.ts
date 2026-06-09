import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { MemoryManager } from "../memory/MemoryManager.js";

/**
 * Hook that automatically extracts and stores long-term memories
 * after each agent call completes.
 *
 * This implements the "Write" side of the Record & Retrieve cycle
 * described in the article: a Memory Agent that periodically extracts
 * key information from conversations and persists them.
 *
 * Runs at `post_agent_call` to capture the full conversation context.
 */
export class MemoryExtractionHook implements AgentHook {
  /** Lower priority = runs later, after other hooks have processed the response. */
  priority = 200;

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly namespace?: string,
  ) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "post_agent_call" && context.messages && context.messages.length > 0) {
      try {
        const ns = this.namespace ?? context.sessionId ?? "global";
        const stored = await this.memoryManager.recordFromConversation(
          context.messages,
          ns,
        );
        if (stored.length > 0) {
          console.log(
            `[MemoryExtractionHook] Extracted ${stored.length} memories from ${context.agentName ?? "unknown"} session=${context.sessionId ?? "n/a"}`
          );
        }
      } catch (err) {
        // Memory extraction failure should never break the agent flow
        console.error("[MemoryExtractionHook] Failed to extract memories:", err);
      }
    }
    return context;
  }
}
