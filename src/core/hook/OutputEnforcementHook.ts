import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";

export class OutputEnforcementHook implements AgentHook {
  priority = 70;

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point === "pre_summary") {
      // Agent has reached max iterations or is about to summarize.
      // Inject an authoritative command to output the full design text immediately.
      if (context.messages) {
        context.messages = [
          ...context.messages,
          ChatMessage.text(
            "system",
            "OutputEnforcementHook",
            "【系统提示】你已达到最大迭代次数。请立即输出完整的设计文档内容，使用 Markdown 格式，包含所有必要的章节和细节。禁止再发起工具调用。"
          ),
        ];
      }
    }
    return context;
  }
}
