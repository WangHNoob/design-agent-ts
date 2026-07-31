import type { ZodTypeAny } from "zod";
import { StructuredParseError } from "./StructuredParseError.js";

export function extractJsonObject(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return text;
}

export function extractJsonArray(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1]!.trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return `[${braceMatch[0]}]`;
  return text;
}

function flattenZodIssues(error: { issues: Array<{ path: (string | number)[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

export interface ParseJsonWithSchemaOptions {
  /** Prefer array extraction (for JSON array responses). */
  preferArray?: boolean;
}

/**
 * Extract JSON from model text → JSON.parse → zod safeParse.
 * Never returns invalid data; throws StructuredParseError with concrete issues.
 */
export function parseJsonWithSchema<T>(
  raw: string,
  schema: ZodTypeAny,
  opts?: ParseJsonWithSchemaOptions,
): T {
  const jsonStr = opts?.preferArray ? extractJsonArray(raw) : extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new StructuredParseError(
      [`JSON parse failed: ${err instanceof Error ? err.message : String(err)}`],
      raw,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredParseError(flattenZodIssues(result.error), raw);
  }
  return result.data as T;
}
