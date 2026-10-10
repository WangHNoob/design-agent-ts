import type { ChatModelPort } from "../../../port/model/ChatModelPort.js";
import type { LoggerPort } from "../../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../../observability/ConsoleLogger.js";
import { ChatMessage } from "../../../port/message/ChatMessage.js";
import { generateStructured } from "../../structured/generateStructured.js";
import { IntentClassifySchema, type IntentClassifyParsed } from "../../structured/schemas.js";

/**
 * 全模式统一意图路由：chat=直答 / query=知识查询管道 / task=规划管道
 * （design/table 共用）。fail-safe 原则：超时 / 结构化解析降级 / 异常 /
 * 超长输入一律 unknown——由 Director 回落当前模式默认管道；路由器只能
 * 放行「明确不该走当前管道」的消息，永远不能挡住真实任务。
 */
export type UserIntent = "chat" | "query" | "task" | "unknown";

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

/** 用户显式选择的执行策略，作为模糊意图的偏置（不强改道）。 */
export type ModeHint = "design" | "query" | "table";

export interface IntentClassifyTrace {
  intent: UserIntent;
  skipped: "disabled_length" | null;
  degraded: boolean;
  attempts: number;
  latencyMs: number;
}

/**
 * LLM 意图路由（全模式统一前置路由的门卫）。
 *
 * fail-safe 原则：超时 / 结构化解析降级 / 异常 / 超长输入一律判 task
 * （= 当前模式默认管道）——路由器只能放行「明显不该走当前管道」的消息，
 * 永远不能挡住真实任务。modeHint 是用户显式选择的执行策略，仅用于
 * 模糊意图的偏置，不改变 fail-safe 方向。
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
    modeHint?: ModeHint,
  ): Promise<UserIntent> {
    return (await this.classifyWithTrace(requirement, history, modeHint)).intent;
  }

  /** Same as classify, plus observability fields for the eval harness. */
  async classifyWithTrace(
    requirement: string,
    history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    modeHint?: ModeHint,
  ): Promise<IntentClassifyTrace> {
    const startedAt = Date.now();
    const maxCheckChars = this.options.maxCheckChars ?? 400;
    if (maxCheckChars > 0 && requirement.length > maxCheckChars) {
      return { intent: "unknown", skipped: "disabled_length", degraded: false, attempts: 0, latencyMs: 0 };
    }

    try {
      const result = await Promise.race([
        this.classifyInner(requirement, history, modeHint),
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
      // 超时/异常：不确定 → unknown（Director 回落模式默认管道，fail-safe）；
      // 整条消息就是寒暄/身份询问本身 → 静态判 chat，避免回落规划产出伪计划
      const staticIntent: UserIntent = isObviousChatText(requirement) ? "chat" : "unknown";
      if (staticIntent === "chat") {
        this.logger.warn("[IntentClassifier] classify failed → static chat fallback:", {
          error: err instanceof Error ? err.message : String(err),
          requirement: requirement.slice(0, 30),
        });
      } else {
        this.logger.warn("[IntentClassifier] classify failed → unknown (mode default):", {
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
    modeHint?: ModeHint,
  ): Promise<Omit<IntentClassifyTrace, "latencyMs">> {
    const recent = (history ?? []).slice(-(this.options.maxHistoryTurns ?? 6));
    const transcript = recent
      .map((h) => `${h.role === "user" ? "用户" : "助手"}: ${h.content}`)
      .join("\n");

    // 模式偏置只作用于"模糊/两可"的意图：用户显式选了策略，尊重其选择。
    // 这是 Cursor 式"自动为主、手动覆盖"的等价物——选择器不再硬切换管道。
    const hintLine = modeHint
      ? `\n[用户当前选择的默认执行策略：${modeHint}。仅当意图模糊或两可时，优先按该策略对应的类别判定（design/table→task，query→query）。]\n`
      : "\n";

    const userPrompt =
      (transcript ? `[对话历史]\n${transcript}\n\n` : "")
      + `[最新消息]\n用户: ${requirement}\n${hintLine}\n请输出分类 JSON。`;

    const messages = [
      ChatMessage.text("system", "system", this.options.prompt),
      ChatMessage.text("user", "user", userPrompt),
    ];

    const result = await generateStructured<IntentClassifyParsed>(
      this.model,
      messages,
      IntentClassifySchema,
      // 输出仅 ~10 token，重试代价极小；GLM 偶发不输出 JSON（见
      // ITERATION_LOG 问题 #2），多一次重试显著降低 unknown 降级率
      { maxRetries: 2, onExhausted: "degrade", degradeValue: { intent: "unknown" } },
    );

    if (result.degraded) {
      this.logger.warn("[IntentClassifier] structured parse degraded → unknown (mode default)");
      return { intent: "unknown", skipped: null, degraded: true, attempts: result.attempts };
    }
    return { intent: result.value.intent, skipped: null, degraded: false, attempts: result.attempts };
  }
}
