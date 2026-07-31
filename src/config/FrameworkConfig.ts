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
    /**
     * Ordered fallback model names (same provider/key/baseUrl as primary by default).
     * On timeout / 429 / consecutive failures the next entry is promoted.
     */
    fallbackModels: string[];
    /** Consecutive retriable failures before opening a model slot circuit. */
    fallbackFailureThreshold: number;
    /** Cooldown before a failed model slot is probed again (ms). */
    fallbackCooldownMs: number;
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
  execution: {
    taskTimeoutMs: number;
    pollIntervalMs: number;
    eventMaxLength: number;
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
  /**
   * Agent observability: Session / Trace / Span persistence.
   * Spans are write-once; exporters reserved for future OTel Collector wiring.
   */
  tracing: {
    enabled: boolean;
    /** When true, also log completed spans to stdout (dev aid). */
    consoleExporter: boolean;
  };
  /**
   * Hard runtime guards (token budget, tool-loop detection, tool resilience).
   * Combined with maxIterations / task timeout — whichever trips first wins.
   */
  guards: {
    /** Per-trace input+output token hard ceiling. 0 disables. */
    traceTokenBudget: number;
    /** Sliding window of recent tool calls for loop detection. */
    toolLoopWindowSize: number;
    /** Abort when the same (tool, paramsHash) appears this many times in the window. */
    toolLoopMaxRepeats: number;
    /** Consecutive external/MCP tool failures before opening the circuit. */
    toolCircuitFailureThreshold: number;
    /** Cooldown before a tripped tool circuit is probed again (ms). */
    toolCircuitCooldownMs: number;
    /** Default max retries for external tools with onError=retry. */
    toolRetryMaxAttempts: number;
    /** Base backoff (ms) between tool retries; doubles each attempt. */
    toolRetryBackoffMs: number;
    /** Per-call timeout for external/MCP tools (ms). 0 disables. */
    toolTimeoutMs: number;
  };
  /**
   * Eval V1: Offline/Online scoring against golden datasets.
   * Offline uses Trace reflux / recordedOutput — no Agent calls.
   */
  eval: {
    /** Default golden dataset path (relative to repo root). */
    defaultDatasetPath: string;
    /**
     * When true, offline CLI skips llm_judge metrics (CI-friendly, no LLM key).
     * Override with `--exact-only` / omit flag on the script.
     */
    offlineExactOnlyDefault: boolean;
  };
}
