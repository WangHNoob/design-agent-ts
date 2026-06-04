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
    o11y: {
      enabled: process.env.O11Y_ENABLED === "true",
      baseUrl: process.env.O11Y_BASE_URL ?? "http://localhost:3003",
      flushIntervalMs: Number(process.env.O11Y_FLUSH_INTERVAL ?? 1000),
      batchSize: Number(process.env.O11Y_BATCH_SIZE ?? 50),
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
