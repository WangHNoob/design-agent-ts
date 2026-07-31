/**
 * MCP on-demand exposure helpers (framework-agnostic).
 */

/** Match exact name, prefix (`kb_`), or glob-prefix (`kb_*`). */
export function toolNameMatchesPattern(name: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p.endsWith("*")) {
    return name.startsWith(p.slice(0, -1));
  }
  if (p.endsWith("_") && !p.includes("*")) {
    return name.startsWith(p);
  }
  return name === p;
}

export function filterToolsByPatterns(
  toolNames: readonly string[],
  patterns: readonly string[],
): string[] {
  if (patterns.length === 0) return [];
  return toolNames.filter((name) =>
    patterns.some((pattern) => toolNameMatchesPattern(name, pattern)),
  );
}

/**
 * Patterns from task allowedTools that refer to MCP tools (exact, prefix, or glob).
 */
export function mcpPatternsFromAllowedTools(
  allowedTools: readonly string[] | undefined,
  allMcpToolNames: readonly string[],
): string[] {
  if (!allowedTools || allowedTools.length === 0) return [];
  const mcpSet = new Set(allMcpToolNames);
  return allowedTools.filter((pattern) => {
    if (pattern.includes("*") || pattern.endsWith("_")) return true;
    if (mcpSet.has(pattern)) return true;
    return allMcpToolNames.some((name) => toolNameMatchesPattern(name, pattern));
  });
}

export type McpExposeMode = "all" | "on_demand";

export interface ResolveExposedMcpToolsInput {
  allMcpToolNames: readonly string[];
  exposeMode: McpExposeMode;
  defaultExposePrefixes: readonly string[];
  /** Skill frontmatter mcpTools + config skillToolAllowlist entries. */
  skillPatterns?: readonly string[];
  /**
   * Task-level allowedTools (discriminated):
   * - `undefined`: apply defaultExposePrefixes ∪ skillPatterns (domain-default path)
   * - `[]`: strict empty — no MCP tools
   * - non-empty: only MCP matching these patterns (no defaultExposePrefixes expansion)
   */
  taskAllowedTools?: readonly string[];
}

/**
 * Resolve which MCP tool names an agent may see for a task.
 *
 * Semantics for `taskAllowedTools`:
 * 1. undefined → on_demand defaults + skill patterns (or all when exposeMode=all)
 * 2. [] → none (strict no external / MCP tools)
 * 3. non-empty → only tools matching those patterns (no defaultExposePrefixes privilege escalation)
 */
export function resolveExposedMcpTools(input: ResolveExposedMcpToolsInput): string[] {
  const { allMcpToolNames, exposeMode } = input;
  if (allMcpToolNames.length === 0) return [];

  // Explicit empty whitelist: never expose MCP.
  if (input.taskAllowedTools !== undefined && input.taskAllowedTools.length === 0) {
    return [];
  }

  // Explicit non-empty whitelist: only patterns declared there (no default prefixes / skill expand).
  if (input.taskAllowedTools !== undefined) {
    const patterns = mcpPatternsFromAllowedTools(input.taskAllowedTools, allMcpToolNames);
    return filterToolsByPatterns(allMcpToolNames, patterns);
  }

  // allowedTools omitted → domain-default path: defaults + skill (or all).
  if (exposeMode === "all") return [...allMcpToolNames];

  const patterns = [
    ...input.defaultExposePrefixes,
    ...(input.skillPatterns ?? []),
  ];
  return filterToolsByPatterns(allMcpToolNames, patterns);
}

/**
 * Remove all registered MCP names from `toolNames`, then re-add only `allowedMcpTools`.
 * Ensures base-descriptor defaultExposePrefixes cannot leak past an explicit task whitelist.
 */
export function stripAndMergeMcpToolNames(
  toolNames: readonly string[],
  allMcpToolNames: readonly string[],
  allowedMcpTools: readonly string[],
): string[] {
  if (allMcpToolNames.length === 0) {
    return [...toolNames];
  }
  const mcpSet = new Set(allMcpToolNames);
  const withoutMcp = toolNames.filter((name) => !mcpSet.has(name));
  return Array.from(new Set([...withoutMcp, ...allowedMcpTools]));
}
