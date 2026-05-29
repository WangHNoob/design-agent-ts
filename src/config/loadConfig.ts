import type { FrameworkConfig } from "./FrameworkConfig.js";

export function loadConfig(): FrameworkConfig {
  return {
    framework: (process.env.AGENT_FRAMEWORK as FrameworkConfig["framework"]) ?? "langgraph",
    model: {
      provider: (process.env.LLM_PROVIDER as FrameworkConfig["model"]["provider"]) ?? "openai",
      modelName: process.env.LLM_MODEL ?? "gpt-4o",
      apiKey: process.env.LLM_API_KEY ?? "",
      baseUrl: process.env.LLM_BASE_URL,
    },
    hitl: {
      enabled: process.env.HITL_ENABLED === "true",
      reviewPoints: {},
      maxRevisionRounds: Number(process.env.HITL_MAX_REVISIONS ?? 3),
    },
    knowledge: {
      wikiPath: process.env.KNOWLEDGE_WIKI_PATH ?? "./knowledge/wiki",
      graphPath: process.env.KNOWLEDGE_GRAPH_PATH ?? "./knowledge/processed",
    },
  };
}
