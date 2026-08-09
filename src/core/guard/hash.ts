/** Deterministic JSON for hashing tool arguments (key-sorted). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Normalize tool arguments before hashing so semantically identical calls hash
 * the same. LLM 常用字符串传数字（`"40"` vs `40`），若按字面 hash，模型交替
 * 两种类型即可绕过重复调用检测（评测 EV-021 实证：kb_query_table limit 在
 * "40"/40 间切换，ToolLoopDetectorHook 从未触发）。
 */
export function normalizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      // Numeric strings ("40", "3.14", "-1") collapse onto their number form.
      if (value.trim() !== "" && !Number.isNaN(Number(value))) {
        out[key] = Number(value);
        continue;
      }
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? normalizeToolArgs(item as Record<string, unknown>)
          : typeof item === "string" && item.trim() !== "" && !Number.isNaN(Number(item))
            ? Number(item)
            : item,
      );
    } else if (typeof value === "object" && value !== null) {
      out[key] = normalizeToolArgs(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Framework-free string hash (djb2 xor) — hex digest. */
export function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export function hashToolCall(toolName: string, args: Record<string, unknown> | undefined): string {
  return hashString(`${toolName}:${stableStringify(normalizeToolArgs(args ?? {}))}`);
}
