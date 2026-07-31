import type { ZodTypeAny } from "zod";
import type { ChatModelPort } from "../../port/model/ChatModelPort.js";
import type { ChatMessage } from "../../port/message/ChatMessage.js";
import { ChatMessage as CM } from "../../port/message/ChatMessage.js";
import type { ModelOptions } from "../../port/model/ModelOptions.js";
import {
  StructuredExhaustedError,
  StructuredParseError,
  type StructuredExhaustedMode,
} from "./StructuredParseError.js";
import { parseJsonWithSchema, type ParseJsonWithSchemaOptions } from "./parseJsonWithSchema.js";

export interface GenerateStructuredOptions<T> extends ParseJsonWithSchemaOptions {
  /** Additional generate attempts after the first (default 2 → 3 total). */
  maxRetries?: number;
  /** Behaviour when retries are exhausted (default "throw"). */
  onExhausted?: StructuredExhaustedMode;
  /** Value (or factory) used when onExhausted is "degrade". */
  degradeValue?: T | ((ctx: { issues: string[]; lastRaw: string; attempts: number }) => T);
  signal?: AbortSignal;
  modelOptions?: ModelOptions;
}

export interface GenerateStructuredResult<T> {
  readonly value: T;
  readonly degraded: boolean;
  readonly attempts: number;
  readonly issues?: string[];
}

function formatRetryFeedback(issues: string[]): string {
  return (
    `上次输出无法通过校验：${issues.join("; ")}。`
    + `请只输出符合 schema 的 JSON，不要 markdown 解释。`
  );
}

/**
 * Call the model, parse+validate with schema, and retry with issue feedback.
 * Exhaustion: throw / degrade / hitl (throws StructuredExhaustedError with mode=hitl).
 */
export async function generateStructured<T>(
  model: ChatModelPort,
  messages: ChatMessage[],
  schema: ZodTypeAny,
  options?: GenerateStructuredOptions<T>,
): Promise<GenerateStructuredResult<T>> {
  const maxRetries = options?.maxRetries ?? 2;
  const onExhausted = options?.onExhausted ?? "throw";
  const conversation = [...messages];
  let lastIssues: string[] = ["no model output"];
  let lastRaw = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;
    const response = await model.generate(conversation, options?.modelOptions, options?.signal);
    const rawText = CM.textContent(response.message) ?? "";
    lastRaw = rawText;

    try {
      const value = parseJsonWithSchema<T>(rawText, schema, {
        preferArray: options?.preferArray,
      });
      return { value, degraded: false, attempts };
    } catch (err) {
      lastIssues = err instanceof StructuredParseError
        ? err.issues
        : [`unexpected parse error: ${err instanceof Error ? err.message : String(err)}`];

      if (attempt < maxRetries) {
        conversation.push(
          CM.text("user", "structured_validator", formatRetryFeedback(lastIssues)),
        );
      }
    }
  }

  if (onExhausted === "degrade") {
    if (options?.degradeValue === undefined) {
      throw new StructuredExhaustedError({
        issues: [...lastIssues, "degradeValue missing"],
        mode: "degrade",
        lastRaw,
        attempts,
      });
    }
    const factory = options.degradeValue;
    const value = typeof factory === "function"
      ? (factory as (ctx: { issues: string[]; lastRaw: string; attempts: number }) => T)({
        issues: lastIssues,
        lastRaw,
        attempts,
      })
      : factory;
    return { value, degraded: true, attempts, issues: lastIssues };
  }

  throw new StructuredExhaustedError({
    issues: lastIssues,
    mode: onExhausted,
    lastRaw,
    attempts,
  });
}
