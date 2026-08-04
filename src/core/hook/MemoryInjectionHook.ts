import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";
import type { MemoryManager } from "../memory/MemoryManager.js";

/**
 * Hook that injects relevant long-term memories into the agent's context
 * before each reasoning step.
 *
 * This implements the "Read" side of the Record & Retrieve cycle:
 * when the agent is about to reason, search long-term memory for relevant
 * information and prepend it as a system message.
 *
 * Runs at `pre_reasoning` to inject context before the LLM call.
 */
export class MemoryInjectionHook implements AgentHook {
  /** Higher priority = runs earlier, before context compression. */
  priority = 60;

  private readonly logger: LoggerPort;

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly namespace?: string,
    logger?: LoggerPort,
  ) {
    this.logger = logger ?? new ConsoleLogger();
  }

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point !== "pre_reasoning" || !context.messages || context.messages.length === 0) {
      return context;
    }

    try {
      // Use the last user message as the query for memory retrieval
      const lastUserMsg = [...context.messages].reverse().find((m) => m.role === "user");
      const query = lastUserMsg ? ChatMessage.textContent(lastUserMsg) : "";
      if (!query) return context;

      const ns = this.namespace ?? context.sessionId ?? "global";
      const memorySection = await this.memoryManager.buildContextSection(query, ns);
      if (!memorySection) return context;

      // Inject as a system message after existing system messages
      const systemMsgs = context.messages.filter((m) => m.role === "system");
      const otherMsgs = context.messages.filter((m) => m.role !== "system");

      const memoryMsg: import("../../port/message/ChatMessage.js").ChatMessage = {
        role: "system",
        name: "MemoryInjectionHook",
        content: [{ type: "text", text: memorySection }],
        metadata: { injectedByLongTermMemory: true },
      };

      context.messages = [...systemMsgs, memoryMsg, ...otherMsgs];
    } catch (err) {
      // Memory injection failure should never break the agent flow
      this.logger.error("[MemoryInjectionHook] Failed to inject memories:", { err });
    }

    return context;
  }
}
