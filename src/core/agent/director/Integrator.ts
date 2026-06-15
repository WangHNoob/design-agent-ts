import type { TaskResult } from "../../schema/TaskResult.js";
import type { Domain } from "../../schema/TaskPlan.js";
import { FieldRegistry, domainDisplayName, type FieldConflict } from "../../schema/FieldRegistry.js";

/** A standalone document produced from one agent's output (or a synthesized report). */
export interface DocumentResult {
  readonly fileName: string;
  readonly markdownContent: string;
  readonly domain: Domain | null;
  readonly taskId: string;
}

/** A detected cross-agent conflict. */
export interface Conflict {
  readonly type: string;
  readonly agents: string[];
  readonly description: string;
}

/** Structured result of integrating all sub-agent outputs. */
export interface IntegrationResult {
  readonly documents: DocumentResult[];
  readonly conflicts: Conflict[];
}

/** Matches a two-column markdown table row: `| field | value |`. */
const FIELD_LINE = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;
/** Matches `key: value` / `key = value` pairs (CJK or word keys, numeric values). */
const KV_PAIR = /([\u4e00-\u9fa5\w]{2,})\s*[:=]\s*(\d+\.?\d*)/g;

/**
 * Integrator — extracts fields, detects cross-agent conflicts, and splits
 * each agent's output into a standalone document.
 *
 * Pure logic over the data model; no IO. The composition root / DirectorAgent
 * is responsible for persisting the produced documents.
 */
export class Integrator {
  /**
   * Integrate all sub-agent outputs.
   * @param results sub-agent task results
   * @param fieldRegistry optional registry to populate + use for conflict detection
   */
  integrateStructured(results: TaskResult[], fieldRegistry?: FieldRegistry): IntegrationResult {
    const registry = fieldRegistry ?? new FieldRegistry();

    for (const result of results) {
      if (!result.output || result.output.trim().length === 0) continue;
      this.extractAndRegister(registry, result);
    }

    const conflicts = this.detectConflictsStructured(results, registry);
    const documents: DocumentResult[] = [];

    for (const result of results) {
      if (!result.output || result.output.trim().length === 0) continue;
      const fileName = `${result.taskId}_${domainDisplayName(result.domain)}`;
      documents.push({ fileName, markdownContent: result.output, domain: result.domain, taskId: result.taskId });
    }

    if (conflicts.length > 0) {
      documents.push({
        fileName: "冲突报告",
        markdownContent: this.buildConflictMarkdown(conflicts),
        domain: null,
        taskId: "conflicts",
      });
    }

    if (registry.detectConflicts().length > 0) {
      documents.push({
        fileName: "字段注册表",
        markdownContent: registry.buildReport(),
        domain: null,
        taskId: "field_registry",
      });
    }

    return { documents, conflicts };
  }

  /** Extract field definitions from a result's markdown and register them. */
  private extractAndRegister(registry: FieldRegistry, result: TaskResult): void {
    const content = result.output;
    const taskId = result.taskId;
    const domain = result.domain ?? "unknown";

    for (const rawLine of content.split("\n")) {
      const trimmed = rawLine.trim();

      // Markdown table rows: | field | value |
      if (trimmed.startsWith("|") && trimmed.endsWith("|") && !trimmed.includes("---")) {
        const m = FIELD_LINE.exec(trimmed);
        if (m) {
          const field = (m[1] ?? "").trim();
          const value = (m[2] ?? "").trim();
          if (
            field && value &&
            !field.includes("属性ID") && !field.includes("字段名") &&
            value !== "-" && value !== "{值或来源}" && !value.startsWith("{")
          ) {
            registry.register(taskId, field, value, `${taskId}/output.md`, domain);
          }
        }
      }

      // key: value pairs (numeric values only, for conflict detection)
      KV_PAIR.lastIndex = 0;
      let kv: RegExpExecArray | null;
      while ((kv = KV_PAIR.exec(trimmed)) !== null) {
        const key = (kv[1] ?? "").trim();
        const value = (kv[2] ?? "").trim();
        if (key.length >= 2 && !key.startsWith("#") && key !== "文档版本" && key !== "创建日期") {
          registry.register(taskId, key, value, `${taskId}/output.md`, domain);
        }
      }
    }
  }

  /** Detect conflicts, preferring the structured FieldRegistry. */
  private detectConflictsStructured(results: TaskResult[], fieldRegistry: FieldRegistry): Conflict[] {
    const regConflicts: FieldConflict[] = fieldRegistry.detectConflicts();
    if (regConflicts.length > 0) {
      return regConflicts.map((fc) => ({
        type: "字段冲突",
        agents: Array.from(new Set(fc.sources.map((s) => s.replace(/\(.*\)/, "")))),
        description: `字段 "${fc.fieldName}" 有 ${fc.valueCount} 个不同的值: ${fc.sources.join(", ")}`,
      }));
    }
    return [];
  }

  /** Build a markdown conflict report. */
  private buildConflictMarkdown(conflicts: Conflict[]): string {
    const lines = ["# 冲突报告", "", "| 冲突类型 | 涉及 Agent | 描述 |", "|---|---|---|"];
    for (const c of conflicts) {
      lines.push(`| ${c.type} | ${c.agents.join(", ")} | ${c.description} |`);
    }
    return lines.join("\n");
  }

  // ─── Backward-compatible string API (kept for existing callers) ──────

  /** Legacy: produce a single combined markdown report. */
  integrate(results: TaskResult[]): string {
    const sections = results.map((r) => {
      const status = r.status === "success" ? "✓" : "✗";
      return `## ${domainDisplayName(r.domain)} ${status}\n\n${r.output}\n`;
    });
    return `# 整合报告\n\n${sections.join("\n")}`;
  }

  /** Legacy: return human-readable conflict descriptions. */
  detectConflicts(results: TaskResult[]): string[] {
    const registry = new FieldRegistry();
    for (const result of results) {
      if (!result.output || result.output.trim().length === 0) continue;
      this.extractAndRegister(registry, result);
    }
    return this.detectConflictsStructured(results, registry).map((c) => c.description);
  }
}
