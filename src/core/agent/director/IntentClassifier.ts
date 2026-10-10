import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../../observability/ConsoleLogger.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { generateStructured } from "../../structured/generateStructured.js";
import { IntentClassifySchema, type IntentClassifyParsed } from "../../structured/schemas.js";

export type UserIntent = "chat" | "task";

/**
 * 显性闲聊静态模式：全串锚定的寒暄/身份询问/致谢告别（≤20 字），
 * 不含任何任务动词与宾语——真实策划需求不会命中。
 * 用途：LLM 分类超时/异常时的静态兜底（比无脑判 task 更准：
 * 整条消息就是问候本身时，"明显是闲聊"有静态证据），
 * 以及 parseFallback 伪计划的二次判定。
 */
const OBVIOUS_CHAT_RE =
  /^(你好|您好|在吗|在么|嗨|哈喽|hi|hello|[下早午晚]好)[？?！!。~～，,\s]*$|^(你是谁|你是什么|你叫什么|你是|介绍一下?你自己|你是谁呀)[？?！!。~～，,\s]*$|^(谢谢|多谢|辛苦了|麻烦了|拜拜|再见|晚安|好的|明白了|收到|ok)[？?！!。~～，,\s]*$|^(你能做(什么|啥)|你会(什么|啥)|你有什么功能|你有什么用|怎么用这个平台|这个平台(是|能做)什么)[？?！!。~～，,\s]*$/i;

export function isObviousChatText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= 20 && OBVIOUS_CHAT_RE.test(trimmed);
}

export interface IntentClassifierOptions {
  /** Classification system prompt (prompts/intent_classify.md content). */
  prompt: string;
  /** Hard wall-clock budget for one classification; timeout → "task". Default 6000. */
  timeoutMs?: number;
  /** Max recent history messages injected for context. Default 6. */
  maxHistoryTurns?: number;
  /** Requirements longer than this skip classification entirely → "task". 0 disables. Default 400. */
  maxCheckChars?: number;
  logger?: LoggerPort;
}

export interface IntentClassifyTrace {
  intent: UserIntent;
  skipped: "disabled_length" | null;
  degraded: boolean;
  attempts: number;
  latencyMs: number;
}

/**
 * LLM 意图分类（design/table 模式闲聊快路径的门卫）。
 *
 * fail-safe 原则：超时 / 结构化解析降级 / 异常 / 超长输入一律判 task——
 * 分类器只能放行「明显是闲聊」的消息，永远不能挡住真实任务。
 */
export class IntentClassifier {
  private readonly logger: LoggerPort;

  constructor(
    private readonly model: ChatModelPort,
    private readonly options: IntentClassifierOptions,
  ) {
    this.logger = options.logger ?? new ConsoleLogger();
  }

  async classify(
    requirement: string,
    history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  ): Promise<UserIntent> {
    return (await this.classifyWithTrace(requirement, history)).intent;
  }

  /** Same as classify, plus observability fields for the eval harness. */
  async classifyWithTrace(
    requirement: string,
    history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  ): Promise<IntentClassifyTrace> {
    const startedAt = Date.now();
    const maxCheckChars = this.options.maxCheckChars ?? 400;
    if (maxCheckChars > 0 && requirement.length > maxCheckChars) {
      return { intent: "task", skipped: "disabled_length", degraded: false, attempts: 0, latencyMs: 0 };
    }

    try {
      const result = await Promise.race([
        this.classifyInner(requirement, history),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`intent classify timeout (${this.options.timeoutMs ?? 6000}ms)`)),
            this.options.timeoutMs ?? 6000,
          );
          timer.unref?.();
        }),
      ]);
      return { ...result, latencyMs: Date.now() - startedAt };
    } catch (err) {
      // 超时/异常：无静态证据 → task（fail-safe 不变）；整条消息就是
      // 寒暄/身份询问本身 → 静态判 chat，避免回落规划产出伪计划
      const staticIntent: UserIntent = isObviousChatText(requirement) ? "chat" : "task";
      if (staticIntent === "chat") {
        this.logger.warn("[IntentClassifier] classify failed → static chat fallback:", {
          error: err instanceof Error ? err.message : String(err),
          requirement: requirement.slice(0, 30),
        });
      } else {
        this.logger.warn("[IntentClassifier] classify failed → task:", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return {
        intent: staticIntent,
        skipped: null,
        degraded: true,
        attempts: 0,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async classifyInner(
    requirement: string,
    history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  ): Promise<Omit<IntentClassifyTrace, "latencyMs">> {
    const recent = (history ?? []).slice(-(this.options.maxHistoryTurns ?? 6));
    const transcript = recent
      .map((h) => `${h.role === "user" ? "用户" : "助手"}: ${h.content}`)
      .join("\n");

    const userPrompt = transcript
      ? `[对话历史]\n${transcript}\n\n[最新消息]\n用户: ${requirement}\n\n请输出分类 JSON。`
      : `[最新消息]\n用户: ${requirement}\n\n请输出分类 JSON。`;

    const messages = [
      ChatMessage.text("system", "system", this.options.prompt),
      ChatMessage.text("user", "user", userPrompt),
    ];

    const result = await generateStructured<IntentClassifyParsed>(
      this.model,
      messages,
      IntentClassifySchema,
      { maxRetries: 1, onExhausted: "degrade", degradeValue: { intent: "task" } },
    );

    if (result.degraded) {
      this.logger.warn("[IntentClassifier] structured parse degraded → task");
      return { intent: "task", skipped: null, degraded: true, attempts: result.attempts };
    }
    return { intent: result.value.intent, skipped: null, degraded: false, attempts: result.attempts };
  }
}
