import type { FrameworkConfig, McpServerConfig } from "./FrameworkConfig.js";
import { validateConfig } from "./validateConfig.js";
import { isHITLTimeoutPolicy, type HITLTimeoutPolicy } from "../port/hitl/HITLTimeoutPolicy.js";
import type { ToolRiskLevel } from "../port/tool/ToolRiskLevel.js";

/**
 * Parse MCP server definitions from the MCP_SERVERS env var (JSON array).
 * Malformed JSON is tolerated (logged + treated as empty) so a bad value
 * doesn't crash startup.
 */
function parseMcpServers(raw: string | undefined): McpServerConfig[] {
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s) => ({
        name: String(s.name ?? ""),
        transport: (s.transport as McpServerConfig["transport"]) ?? "stdio",
        enabled: s.enabled !== false,
        toolPrefix: typeof s.toolPrefix === "string" ? s.toolPrefix : undefined,
        command: typeof s.command === "string" ? s.command : undefined,
        args: Array.isArray(s.args) ? s.args.map((a) => String(a)) : undefined,
        env: isStringRecord(s.env) ? s.env : undefined,
        url: typeof s.url === "string" ? s.url : undefined,
        headers: isStringRecord(s.headers) ? s.headers : undefined,
      }));
  } catch (err) {
    console.warn(`[loadConfig] MCP_SERVERS is not valid JSON, ignoring: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

function resolveHitlTimeoutPolicy(): HITLTimeoutPolicy {
  const raw = process.env.HITL_TIMEOUT_POLICY?.trim();
  if (raw && isHITLTimeoutPolicy(raw)) return raw;
  // Backward compat: HITL_AUTO_CONTINUE=true historically meant "do something on timeout"
  // — we map it to auditable auto_reject (never silent approve).
  if (process.env.HITL_AUTO_CONTINUE === "true") return "auto_reject";
  return "auto_reject";
}

function parseToolRiskOverrides(raw: string | undefined): Record<string, ToolRiskLevel> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, ToolRiskLevel> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "read" || value === "write" || value === "irreversible") {
        out[key] = value;
      }
    }
    return out;
  } catch {
    console.warn("[loadConfig] SECURITY_TOOL_RISK_OVERRIDES is not valid JSON, ignoring");
    return {};
  }
}

function parseModelPrices(
  raw: string | undefined,
): Record<string, { inputPer1M: number; outputPer1M: number }> | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const out: Record<string, { inputPer1M: number; outputPer1M: number }> = {};
    for (const [model, value] of Object.entries(parsed)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      const inputPer1M = Number((value as Record<string, unknown>).inputPer1M);
      const outputPer1M = Number((value as Record<string, unknown>).outputPer1M);
      if (Number.isFinite(inputPer1M) && Number.isFinite(outputPer1M)) {
        out[model] = { inputPer1M, outputPer1M };
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    console.warn("[loadConfig] COST_MODEL_PRICES is not valid JSON, ignoring");
    return undefined;
  }
}

function parseCsvList(raw: string | undefined, defaults: string[] = []): string[] {
  if (!raw || raw.trim().length === 0) return defaults;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseDomainToolDefaults(raw: string | undefined): Record<string, string[]> {
  if (!raw || raw.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [domain, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      out[domain] = value.map((v) => String(v)).filter(Boolean);
    }
    return out;
  } catch {
    console.warn("[loadConfig] PLAN_DOMAIN_TOOL_DEFAULTS is not valid JSON, ignoring");
    return {};
  }
}

export function loadConfig(): FrameworkConfig {
  const hitlEnabled = process.env.HITL_ENABLED === "true";
  const config: FrameworkConfig = {
    framework: (process.env.AGENT_FRAMEWORK as FrameworkConfig["framework"]) ?? "langgraph",
    model: {
      provider: (process.env.LLM_PROVIDER as FrameworkConfig["model"]["provider"]) ?? "openai",
      modelName: process.env.LLM_MODEL ?? "gpt-4o",
      apiKey: process.env.LLM_API_KEY ?? "",
      baseUrl: process.env.LLM_BASE_URL,
      fallbackModels: process.env.LLM_FALLBACK_MODELS
        ? process.env.LLM_FALLBACK_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      fallbackFailureThreshold: Number(process.env.LLM_FALLBACK_FAILURE_THRESHOLD ?? 3),
      fallbackCooldownMs: Number(process.env.LLM_FALLBACK_COOLDOWN_MS ?? 60000),
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
      timeoutPolicy: resolveHitlTimeoutPolicy(),
      timeoutSweepIntervalMs: Number(process.env.HITL_TIMEOUT_SWEEP_INTERVAL_MS ?? 15000),
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
      defaultNamespace: process.env.LTM_DEFAULT_NAMESPACE ?? "global",
      maxContextMemories: Number(process.env.LTM_MAX_CONTEXT_MEMORIES ?? 10),
      minImportanceForContext: Number(process.env.LTM_MIN_IMPORTANCE ?? 0.4),
      autoExtract: process.env.LTM_AUTO_EXTRACT !== "false",
      autoPrune: process.env.LTM_AUTO_PRUNE !== "false",
      maxAgeMs: Number(process.env.LTM_MAX_AGE_MS ?? 2592000000), // 30 days
      pruneBelowImportance: Number(process.env.LTM_PRUNE_BELOW_IMPORTANCE ?? 0.3),
    },
    userSystem: {
      betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
      betterAuthBaseUrl: process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:4527",
      maxConcurrentPerUser: Number(process.env.MAX_CONCURRENT_PER_USER ?? 3),
      postgresUrl: process.env.POSTGRES_URL ?? "",
      redisUrl: process.env.REDIS_URL ?? "",
      adminEmailDomains: process.env.ADMIN_EMAIL_DOMAINS ?? "",
      dingtalk: {
        clientId: process.env.DINGTALK_CLIENT_ID ?? "",
        clientSecret: process.env.DINGTALK_CLIENT_SECRET ?? "",
      },
      allowEmailPassword: process.env.ALLOW_EMAIL_PASSWORD !== "false",
      trustedOrigins: process.env.TRUSTED_ORIGINS ?? "http://localhost:3001",
    },
    messageQueue: {
      enabled: process.env.MQ_ENABLED === "true",
      consumerGroup: process.env.MQ_CONSUMER_GROUP ?? "gd-workers",
      visibilityTimeoutMs: Number(process.env.MQ_VISIBILITY_TIMEOUT_MS ?? 30000),
      blockMs: Number(process.env.MQ_BLOCK_MS ?? 1000),
      maxRetries: Number(process.env.MQ_MAX_RETRIES ?? 3),
    },
    execution: {
      taskTimeoutMs: Number(process.env.EXECUTION_TASK_TIMEOUT_MS ?? 300000),
      pollIntervalMs: Number(process.env.EXECUTION_POLL_INTERVAL_MS ?? 1000),
      eventMaxLength: Number(process.env.EXECUTION_EVENT_MAX_LENGTH ?? 10000),
      sseHeartbeatMs: Number(process.env.SSE_HEARTBEAT_MS ?? 15000),
    },
    memory: {
      archiveEnabled: process.env.MEMORY_ARCHIVE_ENABLED !== "false",
      protectRecentTurns: Number(process.env.MEMORY_PROTECT_RECENT_TURNS ?? 10),
      maxActiveMessages: Number(process.env.MEMORY_MAX_ACTIVE_MESSAGES ?? 40),
    },
    mcp: {
      enabled: process.env.MCP_ENABLED === "true",
      servers: parseMcpServers(process.env.MCP_SERVERS),
    },
    enabledToolGroups: process.env.ENABLED_TOOL_GROUPS
      ? process.env.ENABLED_TOOL_GROUPS.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
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
    blackboard: {
      enabled: process.env.BLACKBOARD_ENABLED !== "false",
      defaultTtlSeconds: Number(process.env.BLACKBOARD_DEFAULT_TTL) || 300,
      webTtlSeconds: Number(process.env.BLACKBOARD_WEB_TTL) || 600,
      recentInjectCount: Number(process.env.BLACKBOARD_RECENT_INJECT) || 5,
      cachedTools: process.env.BLACKBOARD_CACHED_TOOLS
        ? process.env.BLACKBOARD_CACHED_TOOLS.split(",").map((s) => s.trim()).filter(Boolean)
        : [
            "tavily_search",
            "tavily_extract",
            "grep_search",
            "kg_query_node",
            "kg_query_neighbors",
            "kg_list_nodes",
          ],
    },
    tracing: {
      enabled: process.env.TRACING_ENABLED !== "false",
      consoleExporter: process.env.TRACING_CONSOLE_EXPORTER === "true",
    },
    guards: {
      traceTokenBudget: Number(process.env.TRACE_TOKEN_BUDGET ?? 500000),
      toolLoopWindowSize: Number(process.env.TOOL_LOOP_WINDOW_SIZE ?? 8),
      toolLoopMaxRepeats: Number(process.env.TOOL_LOOP_MAX_REPEATS ?? 3),
      toolCircuitFailureThreshold: Number(process.env.TOOL_CIRCUIT_FAILURE_THRESHOLD ?? 3),
      toolCircuitCooldownMs: Number(process.env.TOOL_CIRCUIT_COOLDOWN_MS ?? 60000),
      toolRetryMaxAttempts: Number(process.env.TOOL_RETRY_MAX_ATTEMPTS ?? 2),
      toolRetryBackoffMs: Number(process.env.TOOL_RETRY_BACKOFF_MS ?? 200),
      toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS ?? 30000),
      planHardEnabled: process.env.PLAN_HARD_ENABLED !== "false",
      planMaxReplans: Number(process.env.PLAN_MAX_REPLANS ?? 2),
      planRejectUnauthorizedTools: process.env.PLAN_REJECT_UNAUTHORIZED_TOOLS !== "false",
      planDomainToolDefaults: parseDomainToolDefaults(process.env.PLAN_DOMAIN_TOOL_DEFAULTS),
      multiAgentEnabled: process.env.MULTI_AGENT_ENABLED !== "false",
      multiAgentTokenBudget: Number(
        process.env.MULTI_AGENT_TOKEN_BUDGET
          ?? process.env.TRACE_TOKEN_BUDGET
          ?? 500000,
      ),
      multiAgentMaxFanOut: Number(process.env.MULTI_AGENT_MAX_FAN_OUT ?? 8),
      multiAgentMaxDepth: Number(process.env.MULTI_AGENT_MAX_DEPTH ?? 3),
      multiAgentDetectCycles: process.env.MULTI_AGENT_DETECT_CYCLES !== "false",
      handoffMaxChars: Number(process.env.HANDOFF_MAX_CHARS ?? 4000),
      handoffMaxKeyPoints: Number(process.env.HANDOFF_MAX_KEY_POINTS ?? 12),
      handoffMaxTotalChars: Number(process.env.HANDOFF_MAX_TOTAL_CHARS ?? 12000),
      multiAgentAllowInvoke: process.env.MULTI_AGENT_ALLOW_INVOKE !== "false",
    },
    eval: {
      defaultDatasetPath: process.env.EVAL_DEFAULT_DATASET ?? "eval/datasets/design-golden.v1.json",
      offlineExactOnlyDefault: process.env.EVAL_OFFLINE_EXACT_ONLY !== "false",
    },
    cost: {
      enabled: process.env.COST_ENABLED !== "false",
      inputPricePer1M: Number(process.env.COST_INPUT_PRICE_PER_1M ?? 2.5),
      outputPricePer1M: Number(process.env.COST_OUTPUT_PRICE_PER_1M ?? 10),
      modelPrices: parseModelPrices(process.env.COST_MODEL_PRICES),
      rpmLimitPerUser: Number(process.env.COST_RPM_LIMIT_PER_USER ?? 60),
      tpmLimitPerUser: Number(process.env.COST_TPM_LIMIT_PER_USER ?? 200000),
      windowMs: Number(process.env.COST_WINDOW_MS ?? 60000),
      globalRpmLimit: Number(process.env.COST_GLOBAL_RPM_LIMIT ?? 0),
      globalTpmLimit: Number(process.env.COST_GLOBAL_TPM_LIMIT ?? 0),
      tpmEstimatePerCall: Number(process.env.COST_TPM_ESTIMATE_PER_CALL ?? 8000),
    },
    security: {
      auditEnabled: process.env.SECURITY_AUDIT_ENABLED !== "false",
      irreversibleRequireHitl: process.env.SECURITY_IRREVERSIBLE_REQUIRE_HITL !== "false",
      toolRiskOverrides: parseToolRiskOverrides(process.env.SECURITY_TOOL_RISK_OVERRIDES),
      irreversibleToolNames: parseCsvList(process.env.SECURITY_IRREVERSIBLE_TOOL_NAMES),
      irreversibleNameKeywords: parseCsvList(
        process.env.SECURITY_IRREVERSIBLE_NAME_KEYWORDS,
        ["delete", "drop", "rm"],
      ),
      sandboxDenyKeywords: parseCsvList(
        process.env.TOOL_SANDBOX_DENY_KEYWORDS,
        ["DROP TABLE", "DELETE FROM", "rm -rf", "eval(", "exec("],
      ),
      sandboxBlockPathTraversal: process.env.TOOL_SANDBOX_BLOCK_PATH_TRAVERSAL !== "false",
    },
    saga: {
      compensateEnabled: process.env.SAGA_COMPENSATE_ENABLED !== "false",
      compensateFailureToAudit: process.env.SAGA_COMPENSATE_FAILURE_TO_AUDIT !== "false",
    },
    versioning: {
      enabled: process.env.VERSIONING_ENABLED === "true",
      defaultCanaryPercent: Number(process.env.VERSIONING_DEFAULT_CANARY_PERCENT ?? 0),
      snapshotTtlMs: Number(process.env.VERSIONING_SNAPSHOT_TTL_MS ?? 0),
    },
  };
  validateConfig(config, { port: Number(process.env.PORT ?? 3000) });
  return config;
}
