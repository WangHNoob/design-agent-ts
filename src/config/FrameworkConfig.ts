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
    betterAuthSecret: string;
    betterAuthBaseUrl: string;
    maxConcurrentPerUser: number;
    postgresUrl: string;
    redisUrl: string;
    autoInitSchema: boolean;
    /** Comma-separated email domains that auto-assign admin role */
    adminEmailDomains: string;
    /** DingTalk SSO configuration */
    dingtalk: {
      clientId: string;
      clientSecret: string;
    };
    /** Whether to allow email+password login (default: true) */
    allowEmailPassword: boolean;
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
