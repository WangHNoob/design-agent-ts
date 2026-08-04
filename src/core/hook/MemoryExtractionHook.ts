import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";
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

  private readonly logger: LoggerPort;

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly namespace?: string,
    logger?: LoggerPort,
  ) {
    this.logger = logger ?? new ConsoleLogger();
  }

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "post_agent_call" && context.messages && context.messages.length > 0) {
      try {
        const ns = this.namespace ?? context.sessionId ?? "global";
        const stored = await this.memoryManager.recordFromConversation(
          context.messages,
          ns,
        );
        if (stored.length > 0) {
          this.logger.info(
            `[MemoryExtractionHook] Extracted ${stored.length} memories from ${context.agentName ?? "unknown"} session=${context.sessionId ?? "n/a"}`
          );
        }
      } catch (err) {
        // Memory extraction failure should never break the agent flow
        this.logger.error("[MemoryExtractionHook] Failed to extract memories:", { err });
      }
    }
    return context;
  }
}
