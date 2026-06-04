import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import { ChatMessage } from "../../port/message/ChatMessage.js";

export class IterationBudgetHook implements AgentHook {
  priority = 60;

  constructor(private readonly defaultMaxIterations = 10) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point !== "pre_reasoning") return context;

    const iteration = context.iteration ?? 0;
    const maxIterations = context.maxIterations ?? this.defaultMaxIterations;
    const remaining = maxIterations - iteration;

    if (remaining <= 0) {
      console.warn(`[IterationBudgetHook] 迭代预算耗尽: ${iteration}/${maxIterations}`);
      context.abort = true;
      return context;
    }

    // Inject budget warning into messages so the LLM sees it
    if (remaining <= 3 && context.messages) {
      const warning =
        remaining === 1
          ? "【系统提示】这是你的最后一次推理机会。你必须立即输出完整的文本结果，禁止发起任何工具调用。"
          : `【系统提示】剩余推理次数: ${remaining}。请尽快总结并输出最终设计内容，不要再调用工具。`;

      context.messages = [
        ...context.messages,
        ChatMessage.text("system", "IterationBudgetHook", warning),
      ];
    }

    return context;
  }
}
