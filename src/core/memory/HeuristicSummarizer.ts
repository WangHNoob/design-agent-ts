import type { SummarizerPort } from "../../port/memory/SummarizerPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";

const DEFAULT_MAX_CHARS = 2_000;
const PER_MESSAGE_CHARS = 200;

/**
 * Framework-free heuristic summarizer — no LLM required.
 * Truncates each message and joins them into a bounded archive text.
 */
export class HeuristicSummarizer implements SummarizerPort {
  constructor(private readonly maxChars = DEFAULT_MAX_CHARS) {}

  summarize(messages: readonly ChatMessage[]): string {
    const lines = messages.map((msg) => {
      const text = CM.textContent(msg).replace(/\s+/g, " ").trim();
      const clipped =
        text.length > PER_MESSAGE_CHARS
          ? `${text.slice(0, PER_MESSAGE_CHARS)}…`
          : text;
      return `- [${msg.role}] ${clipped || "(empty)"}`;
    });
    const joined = lines.join("\n");
    if (joined.length <= this.maxChars) return joined;
    return `${joined.slice(0, this.maxChars)}…`;
  }
}
