import type { FrameworkConfig } from "./FrameworkConfig.js";

export function loadConfig(): FrameworkConfig {
  const hitlEnabled = process.env.HITL_ENABLED === "true";
  return {
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
      autoInitSchema: process.env.AUTO_INIT_SCHEMA !== "false",
    },
    messageQueue: {
      enabled: process.env.MQ_ENABLED === "true",
      consumerGroup: process.env.MQ_CONSUMER_GROUP ?? "gd-workers",
      pollIntervalMs: Number(process.env.MQ_POLL_INTERVAL_MS ?? 100),
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
}
