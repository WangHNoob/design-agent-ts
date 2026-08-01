import type { HITLTimeoutPolicy } from "../port/hitl/HITLTimeoutPolicy.js";
import type { ToolRiskLevel } from "../port/tool/ToolRiskLevel.js";

export type FrameworkType = "langgraph" | "mock";

export type McpTransport = "stdio" | "sse" | "http";

export type { HITLTimeoutPolicy } from "../port/hitl/HITLTimeoutPolicy.js";

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
    /**
     * @deprecated Prefer timeoutPolicy. Kept for backward compat —
     * when true and timeoutPolicy unset historically, maps to auto_reject.
     */
    autoContinueOnTimeout: boolean;
    /**
     * On SLA breach: auto_reject | auto_approve | expire | escalate.
     * Auto decisions always set fallback=true (never silent).
     */
    timeoutPolicy: HITLTimeoutPolicy;
    /** Interval for the durable HITL timeout sweeper (ms). 0 disables. */
    timeoutSweepIntervalMs: number;
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
    /** SSE comment-frame heartbeat interval (ms). 0 disables. Default 15000. */
    sseHeartbeatMs: number;
  };
  /**
   * Short-term sliding-window memory: protect recent messages, archive summaries on eviction.
   */
  memory: {
    /** When false, agents keep unbounded InMemory buffers (tests/dev only). */
    archiveEnabled: boolean;
    /**
     * Keep the most recent N non-system messages verbatim
     * (message count — not user/assistant conversation turns).
     */
    protectRecentTurns: number;
    /** Evict when active non-system messages exceed this count (even under token budget). */
    maxActiveMessages: number;
  };
  mcp: {
    enabled: boolean;
    servers: McpServerConfig[];
    /**
     * How MCP tools are granted to agents.
     * - all: every registered MCP tool is visible to all sub-agents / query
     * - on_demand (default): only defaultExposePrefixes ∪ skill/task allowlists
     */
    exposeMode: "all" | "on_demand";
    /**
     * Prefixes / patterns always exposed in on_demand mode (e.g. ["kb_"]).
     * Supports exact names, prefixes ending with `_`, or `prefix*`.
     */
    defaultExposePrefixes: string[];
    /**
     * Optional per-skill MCP tool allowlist (skillName → patterns).
     * Merged with SKILL.md frontmatter `mcpTools` when present.
     */
    skillToolAllowlist: Record<string, string[]>;
    /**
     * Explicit Knowledge Hub projectId injected into every kb_* tool call.
     * Empty = do not inject (server falls back to JWT user currentProjectId).
     */
    defaultProjectId: string;
    /**
     * When true (default), skip registering local wiki/kg/grep knowledge tools
     * if MCP connected and exposed at least one kb_* tool — avoid dual sources.
     */
    disableLocalKnowledgeWhenHealthy: boolean;
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
    /**
     * Plan hard guards (paradigm II): step ordering, tool whitelist, replan budget.
     * When false, whitelist/replan/jump assertions are no-ops.
     */
    planHardEnabled: boolean;
    /**
     * Max Replanner rounds after step failure (replace remaining steps).
     * 0 = never replan; default 2.
     */
    planMaxReplans: number;
    /** When true, unauthorized tool calls fail loud (ToolResult.error / PlanViolationError). */
    planRejectUnauthorizedTools: boolean;
    /**
     * Optional per-domain default tool whitelists (env JSON override).
     * Merged over core defaults; missing domains keep core defaults.
     */
    planDomainToolDefaults: Record<string, string[]>;
    /**
     * Multi-agent runaway guards (paradigm III): shared token budget,
     * fan-out / depth caps, call-cycle detection, handoff distillation.
     * When false, fan-out batching / call-stack / handoff hard limits are no-ops.
     */
    multiAgentEnabled: boolean;
    /**
     * Shared hard token ceiling across all sub-agents under one root Trace.
     * 0 = disable this independent budget (TRACE_TOKEN_BUDGET still applies).
     * Default mirrors TRACE_TOKEN_BUDGET so multi-agent and single-agent share the same ceiling.
     */
    multiAgentTokenBudget: number;
    /** Max parallel sub-tasks in one DAG layer; excess are batched (not rejected). */
    multiAgentMaxFanOut: number;
    /** Max Director→sub-agent call-stack depth (Director depth=0; first sub-agent=1). */
    multiAgentMaxDepth: number;
    /** Abort when agent call graph forms a cycle (A→B→A). */
    multiAgentDetectCycles: boolean;
    /** Max characters in distilled Handoff summary (+ keyPoints text). */
    handoffMaxChars: number;
    /** Max keyPoints entries in a Handoff payload. */
    handoffMaxKeyPoints: number;
    /**
     * Max total characters when injecting multiple predecessor handoffs into one prompt.
     * 0 disables the aggregate cap.
     */
    handoffMaxTotalChars: number;
    /**
     * When true, sub-agents get `invoke_agent` (Agent-as-Tool) for nested calls
     * under AgentCallGuard (depth / cycle). Default true for acceptance wiring.
     */
    multiAgentAllowInvoke: boolean;
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
  /**
   * Cost attribution (Trace-based metering) and RPM/TPM per-user rate limits.
   */
  cost: {
    enabled: boolean;
    inputPricePer1M: number;
    outputPricePer1M: number;
    modelPrices?: Record<string, { inputPer1M: number; outputPer1M: number }>;
    rpmLimitPerUser: number;
    tpmLimitPerUser: number;
    windowMs: number;
    globalRpmLimit: number;
    globalTpmLimit: number;
    /** Estimated tokens reserved per LLM call for TPM pre-check. */
    tpmEstimatePerCall: number;
  };
  /**
   * Security: audit logging, tool risk levels, irreversible HITL gate, param sandbox.
   */
  security: {
    auditEnabled: boolean;
    irreversibleRequireHitl: boolean;
    toolRiskOverrides: Record<string, ToolRiskLevel>;
    irreversibleToolNames: string[];
    irreversibleNameKeywords: string[];
    sandboxDenyKeywords: string[];
    sandboxBlockPathTraversal: boolean;
  };
  /**
   * Saga compensate: reverse-order rollback for side-effect tools on failure/abort.
   */
  saga: {
    /** When false, journal/compensate paths are no-ops. */
    compensateEnabled: boolean;
    /** Enqueue compensate failures to audit_logs (action=saga.compensate_failed). */
    compensateFailureToAudit: boolean;
  };
  /**
   * Prompt / Skill / Workflow versioning (MVCC session snapshots + canary release).
   */
  versioning: {
    enabled: boolean;
    /** Default canary percent for newly published versions (0 = full rollout requires explicit release). */
    defaultCanaryPercent: number;
    /** TTL for in-flight snapshot references (ms). 0 = no automatic cleanup. */
    snapshotTtlMs: number;
  };
}
