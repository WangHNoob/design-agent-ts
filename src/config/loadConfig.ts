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
  };
}
