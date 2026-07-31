import type { ChatMessage } from "../message/ChatMessage.js";

/**
 * Optional summarizer for short-term memory eviction.
 * Core provides a heuristic default; callers may inject an LLM-backed impl.
 */
export interface SummarizerPort {
  summarize(messages: readonly ChatMessage[]): Promise<string> | string;
}
