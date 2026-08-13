import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { SummarizerPort } from "../../port/memory/SummarizerPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";

const DEFAULT_MAX_INPUT_CHARS = 8_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const PER_MESSAGE_CHARS = 400;

const DEFAULT_SYSTEM_PROMPT = `你是对话记忆摘要器。把给定对话消息压缩为结构化摘要，供 Agent 后续回合参考。
必须输出以下 Markdown 结构：
## 要点
- 每条一句话
## 决策
- 已确定的方案/结论
## 遗留项
- 未解决的问题/待确认事项
若某节无内容则写"无"。保留关键数值、ID 与需求原文口径，不得编造内容。`;

export interface LLMSummarizerOptions {
  /** 输入转录总预算（字符），超出从最早消息开始截断。默认 8000。 */
  maxInputChars?: number;
  /** 输出 token 上限。默认 800。 */
  maxOutputTokens?: number;
  systemPrompt?: string;
  logger?: (message: string) => void;
}

/**
 * LLM 记忆摘要器（01-P3）：把滑窗归档的旧消息交给 ChatModelPort 生成结构化
 * 摘要（要点/决策/遗留项），替换启发式截断。
 *
 * 护栏：
 * - 输入转录有字符预算，按消息顺序截断（保留最近语义）；
 * - 模型输出为空/空白时回退原文截断——**绝不静默丢内容**；
 * - 走 ChatModelPort（MeteredChatModel 等包装自动复用成本计量与 tracing）。
 * 默认开关为 heuristic（MEMORY_SUMMARIZER=llm 显式启用），上线前须过小实验对比。
 */
export class LLMSummarizerAdapter implements SummarizerPort {
  constructor(
    private readonly model: ChatModelPort,
    private readonly options: LLMSummarizerOptions = {},
  ) {}

  async summarize(messages: readonly ChatMessage[]): Promise<string> {
    const transcript = this.buildTranscript(messages);
    const system = this.options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const user = `请摘要以下对话（保留关键数值/ID/口径）：\n\n${transcript}`;
    const response = await this.model.generate(
      [CM.text("system", "summarizer", system), CM.text("user", "user", user)],
      { maxTokens: this.options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS },
    );
    const text = CM.textContent(response.message).trim();
    if (text) return text;
    // 空输出回退：启发式截断（与 HeuristicSummarizer 语义一致），绝不静默丢内容
    this.options.logger?.("LLM summarizer returned empty output; falling back to truncated transcript");
    return transcript;
  }

  private buildTranscript(messages: readonly ChatMessage[]): string {
    const maxChars = this.options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
    const lines: string[] = [];
    let used = 0;
    for (const msg of messages) {
      const text = CM.textContent(msg).replace(/\s+/g, " ").trim();
      if (!text) continue;
      const clipped = text.length > PER_MESSAGE_CHARS
        ? `${text.slice(0, PER_MESSAGE_CHARS)}…`
        : text;
      const line = `- [${msg.role}] ${clipped}`;
      if (used + line.length > maxChars) break;
      lines.push(line);
      used += line.length;
    }
    return lines.join("\n") || "(空会话)";
  }
}
