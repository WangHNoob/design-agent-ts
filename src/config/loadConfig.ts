import type { FrameworkConfig, McpServerConfig } from "./FrameworkConfig.js";
import { validateConfig } from "./validateConfig.js";

/**
 * Parse MCP server definitions from the MCP_SERVERS env var (JSON array).
 * Malformed JSON is tolerated (logged + treated as empty) so a bad value
 * doesn't crash startup.
 */
function parseMcpServers(raw: string | undefined): McpServerConfig[] {
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s) => ({
        name: String(s.name ?? ""),
        transport: (s.transport as McpServerConfig["transport"]) ?? "stdio",
        enabled: s.enabled !== false,
        toolPrefix: typeof s.toolPrefix === "string" ? s.toolPrefix : undefined,
        command: typeof s.command === "string" ? s.command : undefined,
        args: Array.isArray(s.args) ? s.args.map((a) => String(a)) : undefined,
        env: isStringRecord(s.env) ? s.env : undefined,
        url: typeof s.url === "string" ? s.url : undefined,
        headers: isStringRecord(s.headers) ? s.headers : undefined,
      }));
  } catch (err) {
    console.warn(`[loadConfig] MCP_SERVERS is not valid JSON, ignoring: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export function loadConfig(): FrameworkConfig {
  const hitlEnabled = process.env.HITL_ENABLED === "true";
  const config: FrameworkConfig = {
    framework: (process.env.AGENT_FRAMEWORK as FrameworkConfig["framework"]) ?? "langgraph",
    model: {
      provider: (process.env.LLM_PROVIDER as FrameworkConfig["model"]["provider"]) ?? "openai",
      modelName: process.env.LLM_MODEL ?? "gpt-4o",
      apiKey: process.env.LLM_API_KEY ?? "",
      baseUrl: process.env.LLM_BASE_URL,
    },
    hitl: {
      enabled: hitlEnabled,
      reviewPoints: hitlEnabled
        ? {
            "hitl-1-task-plan": true,
            "hitl-2-agent-output": true,
            "hitl-3-final": true,
          }
        : {},
      maxRevisionRounds: Number(process.env.HITL_MAX_REVISIONS ?? 3),
      timeout: Number(process.env.HITL_TIMEOUT ?? 300000),
      autoContinueOnTimeout: process.env.HITL_AUTO_CONTINUE === "true",
    },
    knowledge: {
      wikiPath: process.env.KNOWLEDGE_WIKI_PATH ?? "./knowledge/wiki",
      graphPath: process.env.KNOWLEDGE_GRAPH_PATH ?? "./knowledge/processed",
    },
    webSearch: {
      tavilyApiKey: process.env.TAVILY_API_KEY,
      tavilyEnabled: process.env.TAVILY_ENABLED === "true",
    },
    longTermMemory: {
      enabled: process.env.LTM_ENABLED === "true",
      storagePath: process.env.LTM_STORAGE_PATH ?? "./data/long-term-memory",
      defaultNamespace: process.env.LTM_DEFAULT_NAMESPACE ?? "global",
      maxContextMemories: Number(process.env.LTM_MAX_CONTEXT_MEMORIES ?? 10),
      minImportanceForContext: Number(process.env.LTM_MIN_IMPORTANCE ?? 0.4),
      autoExtract: process.env.LTM_AUTO_EXTRACT !== "false",
      autoPrune: process.env.LTM_AUTO_PRUNE !== "false",
      maxAgeMs: Number(process.env.LTM_MAX_AGE_MS ?? 2592000000), // 30 days
      pruneBelowImportance: Number(process.env.LTM_PRUNE_BELOW_IMPORTANCE ?? 0.3),
    },
    userSystem: {
      enabled: process.env.USER_SYSTEM_ENABLED === "true",
      betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "change-me-in-production",
      betterAuthBaseUrl: process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:4527",
      maxConcurrentPerUser: Number(process.env.MAX_CONCURRENT_PER_USER ?? 3),
      postgresUrl: process.env.POSTGRES_URL ?? "postgresql://localhost:5432/game_designer",
      redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
      redisEnabled: process.env.USER_SYSTEM_REDIS_ENABLED !== "false",
      autoInitSchema: process.env.AUTO_INIT_SCHEMA !== "false",
      adminEmailDomains: process.env.ADMIN_EMAIL_DOMAINS ?? "",
      dingtalk: {
        clientId: process.env.DINGTALK_CLIENT_ID ?? "",
        clientSecret: process.env.DINGTALK_CLIENT_SECRET ?? "",
      },
      allowEmailPassword: process.env.ALLOW_EMAIL_PASSWORD !== "false",
      trustedOrigins: process.env.TRUSTED_ORIGINS ?? "http://localhost:3001",
    },
    messageQueue: {
      enabled: process.env.MQ_ENABLED === "true",
      consumerGroup: process.env.MQ_CONSUMER_GROUP ?? "gd-workers",
      pollIntervalMs: Number(process.env.MQ_POLL_INTERVAL_MS ?? 100),
    },
    mcp: {
      enabled: process.env.MCP_ENABLED === "true",
      servers: parseMcpServers(process.env.MCP_SERVERS),
    },
    limits: {
      subAgentMaxIterations: Number(process.env.SUB_AGENT_MAX_ITERATIONS) || 20,
      queryAgentMaxIterations: Number(process.env.QUERY_AGENT_MAX_ITERATIONS) || 20,
      iterationBudgetDefault: Number(process.env.ITERATION_BUDGET_DEFAULT) || 25,
      contextMaxTokens: Number(process.env.CONTEXT_MAX_TOKENS ?? 200000),
      contextCompressionThreshold: Number(process.env.CONTEXT_COMPRESSION_THRESHOLD ?? 0.8),
      tavilyMaxResults: Number(process.env.TAVILY_MAX_RESULTS) || 50,
      grepSearchResultLimit: Number(process.env.GREP_SEARCH_RESULT_LIMIT) || 20,
      webSourceResultLimit: Number(process.env.WEB_SOURCE_RESULT_LIMIT) || 10,
      sessionListLimit: Number(process.env.SESSION_LIST_LIMIT) || 500,
      hitlMaxRevisionRounds: Number(process.env.HITL_MAX_REVISIONS) || 10,
      modelMaxTokens: Number(process.env.MODEL_MAX_TOKENS) || 65536,
    },
  };
  validateConfig(config, { port: Number(process.env.PORT ?? 3000) });
  return config;
}
