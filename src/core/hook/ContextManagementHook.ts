import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";

export class ContextManagementHook implements AgentHook {
  priority = 30;
  private readonly compressionThreshold = 0.7;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "pre_reasoning" && context.messages) {
      const estimatedTokens = this.estimateTokens(context.messages);
      const maxTokens = 128000;
      if (estimatedTokens / maxTokens > this.compressionThreshold) {
        console.log(`[ContextManagementHook] 触发压缩: ${estimatedTokens} tokens`);
      }
    }
    return context;
  }

  private estimateTokens(messages: import("../../port/message/ChatMessage.js").ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
      const text = msg.content.map((c) => (c.type === "text" ? c.text.length : 0)).reduce((a, b) => a + b, 0);
      return sum + Math.ceil(text / 4);
    }, 0);
  }
}
