export type FrameworkType = "langgraph" | "mock";

export interface FrameworkConfig {
  framework: FrameworkType;
  model: {
    provider: "openai" | "anthropic" | "openai-compatible";
    modelName: string;
    apiKey: string;
    baseUrl?: string;
  };
  hitl: {
    enabled: boolean;
    reviewPoints: Record<string, boolean>;
    maxRevisionRounds: number;
    timeout: number;
    autoContinueOnTimeout: boolean;
  };
  knowledge: {
    wikiPath: string;
    graphPath: string;
  };
  webSearch: {
    tavilyApiKey?: string;
    tavilyEnabled: boolean;
  };
  longTermMemory: {
    enabled: boolean;
    storagePath: string;
    defaultNamespace: string;
    maxContextMemories: number;
    minImportanceForContext: number;
    autoExtract: boolean;
    autoPrune: boolean;
    maxAgeMs: number;
    pruneBelowImportance: number;
  };
  userSystem: {
    enabled: boolean;
    jwtSecret: string;
    tokenTtlMs: number;
    maxConcurrentPerUser: number;
    postgresUrl: string;
    redisUrl: string;
    autoInitSchema: boolean;
  };
  messageQueue: {
    enabled: boolean;
    consumerGroup: string;
    pollIntervalMs: number;
  };
  limits: {
    subAgentMaxIterations: number;
    queryAgentMaxIterations: number;
    iterationBudgetDefault: number;
    contextMaxTokens: number;
    contextCompressionThreshold: number;
    tavilyMaxResults: number;
    grepSearchResultLimit: number;
    webSourceResultLimit: number;
    sessionListLimit: number;
    hitlMaxRevisionRounds: number;
    modelMaxTokens: number;
  };
}
