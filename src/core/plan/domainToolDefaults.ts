/**
 * Core default tool whitelists per domain for plan hard guards.
 * Names must stay aligned with SubAgentFactory.DEFAULT_TOOL_NAMES plus
 * session-scoped blackboard tools (workspace_* already in DEFAULT_TOOL_NAMES).
 */

export const DEFAULT_SESSION_TOOLS: readonly string[] = [
  "workspace_read",
  "workspace_list",
  "blackboard_write",
  "blackboard_read",
  "blackboard_search",
  "blackboard_recent",
];

/**
 * Common read / research tools shared across design domains.
 * Keep in sync with SubAgentFactory.DEFAULT_TOOL_NAMES + blackboard_*.
 */
export const DEFAULT_READ_TOOLS: readonly string[] = [
  "wiki_lookup",
  "wiki_read",
  "wiki_list",
  "grep_search",
  "kg_query_node",
  "kg_query_neighbors",
  "kg_list_nodes",
  "tavily_search",
  "tavily_extract",
  ...DEFAULT_SESSION_TOOLS,
];

export const DEFAULT_DOMAIN_TOOL_WHITELIST: Readonly<Record<string, readonly string[]>> = {
  system_design: DEFAULT_READ_TOOLS,
  combat_design: DEFAULT_READ_TOOLS,
  numerical_planning: DEFAULT_READ_TOOLS,
  gameplay_design: DEFAULT_READ_TOOLS,
  executive_planning: DEFAULT_READ_TOOLS,
  qa: DEFAULT_READ_TOOLS,
};

/**
 * Resolve the effective whitelist for a domain.
 * Config overrides merge on top of core defaults (replace per domain key).
 */
export function resolveDomainDefaultTools(
  domain: string,
  configOverrides?: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const override = configOverrides?.[domain];
  if (override) return override;
  return DEFAULT_DOMAIN_TOOL_WHITELIST[domain] ?? DEFAULT_READ_TOOLS;
}
