/**
 * Classify LLM transport/API errors for fallback decisions.
 * Retriable → may promote next model; terminal → fail loud, no fallback.
 */
export type ModelErrorClass = "retriable" | "terminal";

export function classifyModelError(error: unknown): ModelErrorClass {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const status = extractStatus(error);

  if (status !== undefined) {
    if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) {
      return "terminal";
    }
    if (status === 429 || status === 408 || status === 529 || status >= 500) {
      return "retriable";
    }
  }

  if (
    lower.includes("timeout")
    || lower.includes("timed out")
    || lower.includes("etimedout")
    || lower.includes("abort")
    || lower.includes("rate limit")
    || lower.includes("429")
    || lower.includes("overloaded")
    || lower.includes("econnreset")
    || lower.includes("fetch failed")
    || lower.includes("socket hang up")
    // 流中断（上游连接被切断），瞬时故障，应触发重试而非直接判死
    || lower.includes("terminated")
    || lower.includes("503")
    || lower.includes("502")
    || lower.includes("500")
    // Empty completions (e.g. reasoning models that exhaust the output budget
    // on reasoning_content) are retriable — never a silent success.
    || lower.includes("empty response")
    || lower.includes("empty llm")
  ) {
    // User abort should not trigger model fallback.
    if (lower.includes("aborted by user") || lower.includes("aborted before")) {
      return "terminal";
    }
    return "retriable";
  }

  return "terminal";
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "status_code"]) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  const response = record.response;
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}
