import type { FaqMatchRaw } from "./types.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    isRecord(value) &&
    typeof value.output === "string" &&
    typeof value.isError === "boolean"
  );
}

function mapToFaqMatchRaw(raw: Record<string, unknown>): FaqMatchRaw | null {
  if (typeof raw.hit !== "boolean") return null;
  if (typeof raw.score !== "number" || Number.isNaN(raw.score)) return null;

  const faqId =
    typeof raw.faqId === "string"
      ? raw.faqId
      : typeof raw.faq_id === "string"
        ? raw.faq_id
        : undefined;

  const projectId =
    typeof raw.projectId === "string"
      ? raw.projectId
      : typeof raw.project_id === "string"
        ? raw.project_id
        : undefined;

  return {
    hit: raw.hit,
    score: raw.score,
    answer: typeof raw.answer === "string" ? raw.answer : undefined,
    faqId,
    question: typeof raw.question === "string" ? raw.question : undefined,
    projectId,
  };
}

function parsePayload(value: unknown): FaqMatchRaw | null {
  if (typeof value === "string") {
    try {
      return parsePayload(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (!isRecord(value)) return null;
  return mapToFaqMatchRaw(value);
}

/**
 * Parse MCP / tool FAQ match output into {@link FaqMatchRaw}.
 * Accepts JSON string, plain object, or {@link ToolResult} (uses `output`).
 * Returns null on parse failure or tool error.
 */
export function parseFaqMatchResult(input: unknown): FaqMatchRaw | null {
  if (input == null) return null;

  if (isToolResult(input)) {
    if (input.isError) return null;
    return parsePayload(input.output);
  }

  return parsePayload(input);
}
