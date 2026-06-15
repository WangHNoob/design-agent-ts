import type { Domain } from "./TaskPlan.js";

/** A single field/value definition produced by an agent's output. */
export interface FieldEntry {
  readonly fieldName: string;
  readonly value: string;
  readonly type: string | null;
  readonly taskId: string;
  readonly source: string | null;
}

/** A field that has conflicting values across tasks. */
export interface FieldConflict {
  readonly fieldName: string;
  readonly valueCount: number;
  /** "taskId(value)" entries describing where each value came from. */
  readonly sources: string[];
}

/**
 * Session-scoped registry of field/value/type definitions produced by agents.
 * Serves as a shared type contract for cross-agent consistency checking — the
 * QA agent (and the Integrator) use it to detect numeric/value mismatches
 * between different agents' outputs.
 *
 * Pure in-memory logic: no framework or infrastructure dependency.
 */
export class FieldRegistry {
  private readonly fieldsByTask = new Map<string, FieldEntry[]>();
  /** Last-registered entry per field name (used as the canonical value). */
  private readonly latestByField = new Map<string, FieldEntry>();

  constructor(private readonly sessionId: string = "") {}

  /** Register a field definition from an agent's output. */
  register(taskId: string, fieldName: string, value: string, source: string, type: string | null = null): void {
    const entry: FieldEntry = { fieldName, value, type, taskId, source };
    const list = this.fieldsByTask.get(taskId) ?? [];
    list.push(entry);
    this.fieldsByTask.set(taskId, list);
    this.latestByField.set(fieldName, entry);
  }

  /** Find all definitions of a field across tasks (case-insensitive). */
  lookup(fieldName: string): FieldEntry[] {
    const target = fieldName.toLowerCase();
    const results: FieldEntry[] = [];
    for (const list of this.fieldsByTask.values()) {
      for (const fe of list) {
        if (fe.fieldName.toLowerCase() === target) results.push(fe);
      }
    }
    return results;
  }

  /** Detect fields with conflicting values across tasks. */
  detectConflicts(): FieldConflict[] {
    const valueSets = new Map<string, Set<string>>();
    const sources = new Map<string, string[]>();

    for (const list of this.fieldsByTask.values()) {
      for (const entry of list) {
        const set = valueSets.get(entry.fieldName) ?? new Set<string>();
        set.add(entry.value);
        valueSets.set(entry.fieldName, set);

        const src = sources.get(entry.fieldName) ?? [];
        src.push(`${entry.taskId}(${entry.value})`);
        sources.set(entry.fieldName, src);
      }
    }

    const conflicts: FieldConflict[] = [];
    for (const [fieldName, values] of valueSets) {
      if (values.size > 1) {
        conflicts.push({ fieldName, valueCount: values.size, sources: sources.get(fieldName) ?? [] });
      }
    }
    return conflicts;
  }

  /** Total number of distinct registered field names. */
  get fieldCount(): number {
    return this.latestByField.size;
  }

  /** Number of tasks that registered at least one field. */
  get taskCount(): number {
    return this.fieldsByTask.size;
  }

  /** Build a markdown report for QA / integration consumption. */
  buildReport(): string {
    const lines: string[] = ["# 字段注册表", ""];
    if (this.sessionId) lines.push(`Session: ${this.sessionId}`);
    lines.push(`Total fields: ${this.latestByField.size} across ${this.fieldsByTask.size} tasks`, "");

    lines.push("| 字段名 | 值 | 类型 | 来源任务 | 来源文档 |");
    lines.push("|--------|-----|------|----------|----------|");
    for (const list of this.fieldsByTask.values()) {
      for (const fe of list) {
        lines.push(`| ${fe.fieldName} | ${fe.value} | ${fe.type ?? "-"} | ${fe.taskId} | ${fe.source ?? "-"} |`);
      }
    }

    const conflicts = this.detectConflicts();
    if (conflicts.length > 0) {
      lines.push("", "## 字段冲突", "");
      lines.push("| 字段名 | 冲突值数 | 来源 |");
      lines.push("|---|---|---|");
      for (const c of conflicts) {
        lines.push(`| ${c.fieldName} | ${c.valueCount} | ${c.sources.join(", ")} |`);
      }
    }

    return lines.join("\n");
  }

  /** Resolve a field conflict by setting all entries to the specified value. */
  resolve(fieldName: string, resolvedValue: string): void {
    const target = fieldName.toLowerCase();
    for (const [taskId, list] of this.fieldsByTask) {
      const updated = list.map((fe) =>
        fe.fieldName.toLowerCase() === target
          ? { ...fe, value: resolvedValue, source: `${fe.source ?? ""} (已裁决)` }
          : fe,
      );
      this.fieldsByTask.set(taskId, updated);
      const resolvedEntry = updated.find((fe) => fe.fieldName.toLowerCase() === target);
      if (resolvedEntry) this.latestByField.set(resolvedEntry.fieldName, resolvedEntry);
    }
  }

  clear(): void {
    this.fieldsByTask.clear();
    this.latestByField.clear();
  }
}

/** Map a Domain to its Chinese display name (shared by Integrator). */
export function domainDisplayName(domain: Domain | null | undefined): string {
  switch (domain) {
    case "system_design": return "系统设计";
    case "combat_design": return "战斗设计";
    case "numerical_planning": return "数值设计";
    case "gameplay_design": return "玩法设计";
    case "executive_planning": return "执行策划";
    case "qa": return "QA审查";
    default: return "未知";
  }
}
