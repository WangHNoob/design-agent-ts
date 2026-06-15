export type FrameworkType = "langgraph" | "mock";

export type McpTransport = "stdio" | "sse" | "http";

export interface McpServerConfig {
  /** Stable name for the server (used for logging and tool prefixing). */
  name: string;
  transport: McpTransport;
  /** Whether to connect to this server on startup. */
  enabled: boolean;
  /** Optional prefix applied to every tool name from this server (e.g. "kb_"). */
  toolPrefix?: string;
  /** stdio: executable to spawn. */
  command?: string;
  /** stdio: command arguments. */
  args?: string[];
  /** stdio: environment variables for the spawned process. */
  env?: Record<string, string>;
  /** sse/http: server endpoint URL. */
  url?: string;
  /** sse/http: extra HTTP headers (e.g. Authorization). */
  headers?: Record<string, string>;
}

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
  mcp: {
    enabled: boolean;
    servers: McpServerConfig[];
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
