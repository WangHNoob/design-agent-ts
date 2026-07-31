import type { HandoffLimits, HandoffPayload } from "../schema/HandoffPayload.js";
import { HandoffViolationError } from "./HandoffViolationError.js";

export interface DistillHandoffInput {
  taskId: string;
  domain: string;
  output: string;
  artifacts?: readonly string[];
  limits: HandoffLimits;
}

/**
 * Heuristic distillation — no LLM. Pulls headings, list items, and leading paragraphs.
 */
export function distillHandoff(input: DistillHandoffInput): HandoffPayload {
  const text = (input.output ?? "").replace(/\r\n/g, "\n").trim();
  const limits = input.limits;
  const maxChars = Math.max(1, limits.maxChars);
  const maxKeyPoints = Math.max(0, limits.maxKeyPoints);

  const keyPoints = extractKeyPoints(text, maxKeyPoints);
  let summary = extractSummary(text, keyPoints);
  let truncated = false;

  const budgetForSummary = Math.max(
    64,
    maxChars - keyPoints.reduce((n, p) => n + p.length, 0),
  );
  if (summary.length > budgetForSummary) {
    summary = summary.slice(0, budgetForSummary).trimEnd() + "…";
    truncated = true;
  }

  const payload: HandoffPayload = {
    taskId: input.taskId,
    domain: input.domain,
    summary,
    keyPoints,
    artifacts: input.artifacts?.length ? [...input.artifacts] : ["output.md"],
    schemaVersion: "1",
    truncated: truncated || text.length > maxChars || keyPoints.length >= maxKeyPoints
      ? true
      : undefined,
  };

  // Soft-trim if overall still over (validate will reject hard oversized payloads).
  return softClamp(payload, limits);
}

export function formatHandoffForPrompt(payload: HandoffPayload): string {
  const points = payload.keyPoints.length > 0
    ? payload.keyPoints.map((p) => `- ${p}`).join("\n")
    : "- （无要点）";
  const artifacts = payload.artifacts?.length
    ? `\n产物引用: ${payload.artifacts.join(", ")}`
    : "";
  const trunc = payload.truncated ? "\n> （已蒸馏截断）" : "";
  return [
    `### ${payload.taskId} [${payload.domain}]`,
    `结论: ${payload.summary}`,
    "要点:",
    points,
    artifacts.trimStart(),
    trunc.trimStart(),
  ].filter(Boolean).join("\n");
}

export interface CollectHandoffsResult {
  sections: string[];
  /** First predecessor index that was skipped due to total budget (if any). */
  truncatedAtIndex?: number;
  totalChars: number;
}

/**
 * Format predecessor handoffs under an aggregate character budget.
 * When `maxTotalChars` > 0 and the next handoff would exceed it, stop and mark truncated.
 */
export function collectHandoffsForPrompt(
  handoffs: readonly HandoffPayload[],
  maxTotalChars: number,
): CollectHandoffsResult {
  const sections: string[] = [];
  let totalChars = 0;
  for (let i = 0; i < handoffs.length; i += 1) {
    const formatted = formatHandoffForPrompt(handoffs[i]!);
    if (maxTotalChars > 0 && totalChars + formatted.length > maxTotalChars) {
      sections.push(
        `> （后续前驱 Handoff 因总量上限 ${maxTotalChars} 字符已截断，跳过 ${handoffs[i]!.taskId} 及之后）`,
      );
      return { sections, truncatedAtIndex: i, totalChars };
    }
    totalChars += formatted.length;
    sections.push(formatted);
  }
  return { sections, totalChars };
}

/**
 * Hard-validate schema + size. Throws HandoffViolationError on breach.
 */
export function validateHandoff(payload: HandoffPayload, limits: HandoffLimits): void {
  if (!payload || typeof payload !== "object") {
    throw new HandoffViolationError({ reason: "payload missing", field: "payload" });
  }
  if (payload.schemaVersion !== "1") {
    throw new HandoffViolationError({
      reason: `unsupported schemaVersion=${String(payload.schemaVersion)}`,
      field: "schemaVersion",
    });
  }
  if (typeof payload.taskId !== "string" || !payload.taskId.trim()) {
    throw new HandoffViolationError({ reason: "taskId required", field: "taskId" });
  }
  if (typeof payload.domain !== "string" || !payload.domain.trim()) {
    throw new HandoffViolationError({ reason: "domain required", field: "domain" });
  }
  if (typeof payload.summary !== "string") {
    throw new HandoffViolationError({ reason: "summary must be string", field: "summary" });
  }
  if (!Array.isArray(payload.keyPoints)) {
    throw new HandoffViolationError({ reason: "keyPoints must be array", field: "keyPoints" });
  }
  if (payload.keyPoints.length > limits.maxKeyPoints) {
    throw new HandoffViolationError({
      reason: `keyPoints ${payload.keyPoints.length} exceeds max ${limits.maxKeyPoints}`,
      field: "keyPoints",
    });
  }
  if (payload.summary.length > limits.maxChars) {
    throw new HandoffViolationError({
      reason: `summary length ${payload.summary.length} exceeds maxChars ${limits.maxChars}`,
      field: "summary",
    });
  }
  const totalChars = payload.summary.length
    + payload.keyPoints.reduce((n, p) => n + (typeof p === "string" ? p.length : 0), 0);
  if (totalChars > limits.maxChars * 2) {
    // Allow keyPoints + summary combined up to 2× maxChars; still fail loud on extremes.
    throw new HandoffViolationError({
      reason: `total handoff chars ${totalChars} exceeds soft ceiling ${limits.maxChars * 2}`,
      field: "summary",
    });
  }
}

function extractKeyPoints(text: string, maxKeyPoints: number): string[] {
  if (maxKeyPoints <= 0 || !text) return [];
  const points: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const cleaned = raw.replace(/^#+\s*/, "").replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (!cleaned || cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    points.push(cleaned.length > 200 ? cleaned.slice(0, 200) + "…" : cleaned);
  };

  for (const line of text.split("\n")) {
    if (points.length >= maxKeyPoints) break;
    const trimmed = line.trim();
    if (/^#{1,3}\s+\S/.test(trimmed)) {
      push(trimmed);
    } else if (/^[-*+]\s+\S/.test(trimmed) || /^\d+\.\s+\S/.test(trimmed)) {
      push(trimmed);
    }
  }

  if (points.length === 0) {
    const firstSentence = text.split(/[。.!?\n]/).map((s) => s.trim()).find((s) => s.length > 0);
    if (firstSentence) push(firstSentence);
  }

  return points.slice(0, maxKeyPoints);
}

function extractSummary(text: string, keyPoints: readonly string[]): string {
  if (!text) return "（空产出）";
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 0) {
    // Prefer first non-heading paragraph; else first paragraph stripped of markdown heading.
    const body = paragraphs.find((p) => !/^#{1,6}\s/.test(p)) ?? paragraphs[0]!;
    return body.replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ").trim();
  }
  if (keyPoints.length > 0) {
    return keyPoints.slice(0, 3).join("；");
  }
  return text.slice(0, 400);
}

function softClamp(payload: HandoffPayload, limits: HandoffLimits): HandoffPayload {
  let truncated = payload.truncated === true;
  let summary = payload.summary;
  let keyPoints = [...payload.keyPoints];

  if (keyPoints.length > limits.maxKeyPoints) {
    keyPoints = keyPoints.slice(0, limits.maxKeyPoints);
    truncated = true;
  }
  if (summary.length > limits.maxChars) {
    summary = summary.slice(0, limits.maxChars).trimEnd() + "…";
    truncated = true;
  }

  return {
    ...payload,
    summary,
    keyPoints,
    truncated: truncated || undefined,
  };
}
