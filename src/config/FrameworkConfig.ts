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
    defaultNamespace: string;
    maxContextMemories: number;
    minImportanceForContext: number;
    autoExtract: boolean;
    autoPrune: boolean;
    maxAgeMs: number;
    pruneBelowImportance: number;
  };
  userSystem: {
    betterAuthSecret: string;
    betterAuthBaseUrl: string;
    maxConcurrentPerUser: number;
    postgresUrl: string;
    redisUrl: string;
    /** Comma-separated email domains that auto-assign admin role */
    adminEmailDomains: string;
    /** DingTalk SSO configuration */
    dingtalk: {
      clientId: string;
      clientSecret: string;
    };
    /** Whether to allow email+password login (default: true) */
    allowEmailPassword: boolean;
    /**
     * Additional trusted origins for Better Auth CORS (comma-separated).
     * Include your frontend URL(s) here. The base URL is always trusted automatically.
     * e.g. "http://localhost:3001,https://app.example.com"
     */
    trustedOrigins: string;
  };
  messageQueue: {
    enabled: boolean;
    consumerGroup: string;
    visibilityTimeoutMs: number;
    blockMs: number;
    maxRetries: number;
  };
  mcp: {
    enabled: boolean;
    servers: McpServerConfig[];
  };
  /**
   * Tool groups to enable. If empty, all groups are enabled.
   * Groups are registered in bootstrap.ts using toolRegistry.registerToGroup().
   * Example: ["knowledge", "web"] enables only tools in these groups.
   */
  enabledToolGroups: string[];
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
  /**
   * 共享黑板：多 Agent 协作时缓存工具/联网调用结果，避免重复调用。
   */
  blackboard: {
    /** 总开关；false 时退回无缓存行为。 */
    enabled: boolean;
    /** 默认 TTL（秒），用于检索类工具与 blackboard_write。 */
    defaultTtlSeconds: number;
    /** 联网类工具（tavily / kb_*）的 TTL（秒）。 */
    webTtlSeconds: number;
    /** 每个子任务启动时注入的近期黑板要点条数。 */
    recentInjectCount: number;
    /** 启用透明缓存的工具名白名单（kb_* MCP 工具在 bootstrap 运行时追加）。 */
    cachedTools: string[];
  };
}
