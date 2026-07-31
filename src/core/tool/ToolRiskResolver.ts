import type { ToolRiskLevel } from "../../port/tool/ToolRiskLevel.js";

export interface ToolRiskResolverConfig {
  readonly toolRiskOverrides: Readonly<Record<string, ToolRiskLevel>>;
  readonly irreversibleToolNames: readonly string[];
  /** Match irreversible when tool name token equals any keyword (case-insensitive). */
  readonly irreversibleNameKeywords: readonly string[];
}

const DEFAULT_READ_PREFIXES = [
  "wiki_",
  "kg_",
  "tavily_",
  "grep_search",
  "workspace_read",
  "workspace_list",
  "blackboard_read",
  "blackboard_search",
  "blackboard_recent",
] as const;

const DEFAULT_WRITE_NAMES = new Set(["blackboard_write"]);

/** Split tool names on `_` and `-` for whole-token keyword matching. */
export function tokenizeToolName(toolName: string): string[] {
  return toolName.toLowerCase().split(/[_-]+/).filter(Boolean);
}

/**
 * Resolves effective tool risk level from config overrides, irreversible list/keywords,
 * descriptor hint, and name heuristics.
 */
export class ToolRiskResolver {
  private readonly overrideMap: Readonly<Record<string, ToolRiskLevel>>;
  private readonly irreversibleSet: ReadonlySet<string>;
  private readonly irreversibleKeywords: readonly string[];

  constructor(config: ToolRiskResolverConfig) {
    this.overrideMap = config.toolRiskOverrides;
    this.irreversibleSet = new Set(config.irreversibleToolNames.map((n) => n.toLowerCase()));
    this.irreversibleKeywords = config.irreversibleNameKeywords.map((k) => k.toLowerCase());
  }

  resolve(toolName: string, descriptorRisk?: ToolRiskLevel): ToolRiskLevel {
    const override = this.overrideMap[toolName];
    if (override) return override;

    const lower = toolName.toLowerCase();
    if (this.irreversibleSet.has(lower)) return "irreversible";
    const tokens = tokenizeToolName(toolName);
    if (this.irreversibleKeywords.some((kw) => tokens.includes(kw))) return "irreversible";

    if (descriptorRisk) return descriptorRisk;

    if (DEFAULT_WRITE_NAMES.has(toolName)) return "write";
    if (DEFAULT_READ_PREFIXES.some((p) => toolName.startsWith(p) || toolName === p)) return "read";
    return "write";
  }
}
