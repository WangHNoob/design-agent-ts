import type { EvalBaseline, EvalCase, EvalDataset, EvalMetric, MetricKind } from "../../port/eval/types.js";

/**
 * Parse and validate a dataset JSON object (file contents already read by the caller).
 * Keeps core free of fs — composition root / script loads the file.
 */
export function parseEvalDataset(raw: unknown): EvalDataset {
  if (!isRecord(raw)) throw new Error("Dataset root must be an object");

  const id = requireString(raw, "id");
  const name = requireString(raw, "name");
  const version = requireString(raw, "version");
  const description = optionalString(raw, "description");

  if (!Array.isArray(raw.metrics) || raw.metrics.length === 0) {
    throw new Error("Dataset.metrics must be a non-empty array");
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    throw new Error("Dataset.cases must be a non-empty array");
  }
  if (!Array.isArray(raw.baselines)) {
    throw new Error("Dataset.baselines must be an array");
  }

  const metrics: EvalMetric[] = raw.metrics.map((m, i) => parseMetric(m, i));
  const cases: EvalCase[] = raw.cases.map((c, i) => parseCase(c, i));
  const baselines: EvalBaseline[] = raw.baselines.map((b, i) => parseBaseline(b, i));

  const metricIds = new Set(metrics.map((m) => m.id));
  const caseIds = new Set(cases.map((c) => c.id));
  for (const b of baselines) {
    if (!caseIds.has(b.caseId)) throw new Error(`Baseline references unknown caseId: ${b.caseId}`);
    if (!metricIds.has(b.metricId)) throw new Error(`Baseline references unknown metricId: ${b.metricId}`);
  }

  return { id, name, version, description, metrics, cases, baselines };
}

function parseMetric(raw: unknown, index: number): EvalMetric {
  if (!isRecord(raw)) throw new Error(`metrics[${index}] must be an object`);
  const kind = requireString(raw, "kind") as MetricKind;
  if (kind !== "exact_match" && kind !== "llm_judge") {
    throw new Error(`metrics[${index}].kind must be exact_match|llm_judge`);
  }
  return {
    id: requireString(raw, "id"),
    name: requireString(raw, "name"),
    kind,
    criteria: optionalString(raw, "criteria"),
    passThreshold: typeof raw.passThreshold === "number" ? raw.passThreshold : undefined,
  };
}

function parseCase(raw: unknown, index: number): EvalCase {
  if (!isRecord(raw)) throw new Error(`cases[${index}] must be an object`);
  return {
    id: requireString(raw, "id"),
    input: requireString(raw, "input"),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : undefined,
    recordedOutput: optionalString(raw, "recordedOutput"),
    sourceTraceId: optionalString(raw, "sourceTraceId"),
    sourceUserId: optionalString(raw, "sourceUserId"),
  };
}

function parseBaseline(raw: unknown, index: number): EvalBaseline {
  if (!isRecord(raw)) throw new Error(`baselines[${index}] must be an object`);
  const expectedContains = Array.isArray(raw.expectedContains)
    ? raw.expectedContains.filter((t): t is string => typeof t === "string")
    : undefined;
  return {
    caseId: requireString(raw, "caseId"),
    metricId: requireString(raw, "metricId"),
    expectedOutput: optionalString(raw, "expectedOutput"),
    expectedContains,
    judgeRubric: optionalString(raw, "judgeRubric"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || !v) throw new Error(`Missing or invalid string field: ${key}`);
  return v;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}
