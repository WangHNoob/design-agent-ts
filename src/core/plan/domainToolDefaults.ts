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
 *
 * Knowledge sources:
 * - WeKnora MCP（现役）: hybrid_search / list_* / get_* / list_chunks / wiki_search|read_page|index_view
 * - 本地文件知识库（MCP 不可用时的降级兜底，勿删——PLAN_HARD 开启时白名单同样约束降级路径）
 * - tavily_* 联网兜底
 */
export const DEFAULT_READ_TOOLS: readonly string[] = [
  // WeKnora MCP 检索工具（与 .env MCP_DEFAULT_EXPOSE_PREFIXES 保持一致）
  "hybrid_search",
  "list_knowledge_bases",
  "get_knowledge_base",
  "list_knowledge",
  "get_knowledge",
  "list_chunks",
  "wiki_search",
  "wiki_read_page",
  "wiki_index_view",
  // 本地降级兜底（WeKnora MCP 健康时通常未注册，注册名缺失会在工厂映射时静默剔除）
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
