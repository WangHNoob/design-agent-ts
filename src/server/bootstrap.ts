import { createApp } from "./app.js";
import { loadConfig } from "../config/loadConfig.js";
import type { FrameworkConfig } from "../config/FrameworkConfig.js";
import { Container } from "./Container.js";
import { ToolManager } from "../core/tool/ToolManager.js";
import { SkillManager } from "../core/skill/SkillManager.js";
import { loadSkills } from "./SkillLoader.js";
import { loadWorkflows } from "./WorkflowLoader.js";
import { DirectorAgent } from "../core/agent/director/DirectorAgent.js";
import { configureSubAgentDescriptors, resetSubAgentDescriptors, setExtraSubAgentToolNames } from "../core/agent/subagents/SubAgentFactory.js";
import { resolveExposedMcpTools } from "../core/structured/mcpExpose.js";
import { setDirector, setConsoleExecutionDependencies, setConsoleRateLimit, hasActiveExecutions } from "./routes/console.js";
import { setSessionRepositoryFactory, setWorkspaceManager } from "./routes/sessions.js";
import { setHITLRouteDependencies } from "./routes/hitl.js";
import { DurableHumanReviewGateway } from "../core/hitl/DurableHumanReviewGateway.js";
import { LoggingHook } from "../core/hook/LoggingHook.js";
import { ValidationHook } from "../core/hook/ValidationHook.js";
import { IterationBudgetHook } from "../core/hook/IterationBudgetHook.js";
import { OutputEnforcementHook } from "../core/hook/OutputEnforcementHook.js";
import { ContextManagementHook } from "../core/hook/ContextManagementHook.js";
import { MemoryInjectionHook } from "../core/hook/MemoryInjectionHook.js";
import { MemoryExtractionHook } from "../core/hook/MemoryExtractionHook.js";
import { TracingHook } from "../core/hook/TracingHook.js";
import { TokenBudgetHook } from "../core/hook/TokenBudgetHook.js";
import { CancellationHook } from "../core/hook/CancellationHook.js";
import { AuditCompensateFailureQueue } from "../core/saga/AuditCompensateFailureQueue.js";
import { InMemoryCompensateFailureQueue } from "../core/saga/InMemoryCompensateFailureQueue.js";
import type { CompensateFailureQueuePort } from "../port/saga/CompensateFailureQueuePort.js";
import { CostAccountingHook } from "../core/hook/CostAccountingHook.js";
import { RateLimitHook } from "../core/hook/RateLimitHook.js";
import { RateLimitGuard } from "../core/cost/RateLimitGuard.js";
import { MeteredChatModel } from "../core/cost/MeteredChatModel.js";
import type { ChatModelPort } from "../port/model/ChatModelPort.js";
import type { CostStorePort } from "../port/cost/CostStorePort.js";
import type { RateLimitPort } from "../port/cost/RateLimitPort.js";
import { ToolLoopDetectorHook } from "../core/hook/ToolLoopDetectorHook.js";
import { KnowledgeFlywheelHook } from "../core/hook/KnowledgeFlywheelHook.js";
import { DefaultTracer, NoOpTracer } from "../core/tracing/DefaultTracer.js";
import { ConsoleTraceExporter } from "../core/tracing/ConsoleTraceExporter.js";
import { PostgresTraceStoreAdapter } from "../adapter/postgres/PostgresTraceStoreAdapter.js";
import { setTraceStore } from "./routes/traces.js";
import type { TracerPort } from "../port/tracing/TracerPort.js";
import type { TraceRuntimeState } from "../port/tracing/TracerPort.js";
import type { TraceStorePort } from "../port/tracing/TraceStorePort.js";
import { WikiPageTool } from "../core/tool/knowledge/WikiPageTool.js";
import { GrepSearchTool } from "../core/tool/knowledge/GrepSearchTool.js";
import { KnowledgeGraphTool } from "../core/tool/knowledge/KnowledgeGraphTool.js";
import { TavilySearchTool } from "../adapter/tavily/TavilySearchTool.js";
import { DelegatingTool } from "../core/tool/DelegatingTool.js";
import { ResilientToolWrapper, type ResilientToolOptions } from "../core/tool/ResilientToolWrapper.js";
import { ToolCircuitRegistry } from "../core/resilience/ToolCircuitRegistry.js";
import { BlackboardStore } from "../core/blackboard/BlackboardStore.js";
import { loadPrompt, clearPromptCache } from "./PromptLoader.js";
import { SettingsManager } from "../core/settings/SettingsManager.js";
import { setSettingsManager, setSettingsContainer, setTavilyTool, setMCPStatus } from "./routes/settings.js";
import { NodeFileSystemAdapter } from "../adapter/fs/NodeFileSystemAdapter.js";
import { NodeIdGeneratorAdapter } from "../adapter/infra/NodeIdGeneratorAdapter.js";
import { NodeContextStorageAdapter } from "../adapter/infra/NodeContextStorageAdapter.js";
import { WorkspaceManager } from "../core/workspace/WorkspaceManager.js";
import { MemoryManager } from "../core/memory/MemoryManager.js";
import { PostgresDatabaseAdapter } from "../adapter/postgres/PostgresDatabaseAdapter.js";
import { PostgresSessionRepository } from "../adapter/postgres/PostgresSessionRepository.js";
import { PostgresExecutionRepository } from "../adapter/postgres/PostgresExecutionRepository.js";
import { PostgresHITLRepository, PostgresHITLTimeoutScanAdapter } from "../adapter/postgres/PostgresHITLRepository.js";
import { AlwaysFreshHITLCheck } from "../core/hitl/AlwaysFreshHITLCheck.js";
import { sweepHITLTimeouts } from "../core/hitl/HITLTimeoutSweeper.js";
import { ExecutionService } from "../core/execution/ExecutionService.js";
import { ContextualPostgresLongTermMemoryAdapter } from "../adapter/postgres/ContextualPostgresLongTermMemoryAdapter.js";
import { BetterAuthAdapter } from "../adapter/betterauth/BetterAuthAdapter.js";
import { RedisTenantIsolationAdapter } from "../adapter/redis/RedisTenantIsolationAdapter.js";
import type { TenantIsolationPort } from "../port/user/TenantIsolationPort.js";
import type { TenantContext } from "../port/user/TenantIsolationPort.js";
import { RedisMessageQueueAdapter } from "../adapter/redis/RedisMessageQueueAdapter.js";
import { RedisExecutionEventStoreAdapter } from "../adapter/redis/RedisExecutionEventStoreAdapter.js";
import { UserContextManager } from "../core/user/UserContextManager.js";
import { ExecutionWorker, EXECUTION_QUEUE } from "./worker/ExecutionWorker.js";
import { setAuthAdapter, setTenantPort, setTenantContextStorage, setDatabasePort } from "./app.js";
import { usersRoute, setUserContextManager, setBetterAuthAdapter } from "./routes/users.js";
import { McpSdkClient, type McpTransportConfig } from "../adapter/mcp/McpSdkClient.js";
import { createDirectorModel } from "./compose/directorModel.js";
import { ConsoleLogger } from "../core/observability/ConsoleLogger.js";
import { toMcpTransportConfig } from "./compose/mcpTransport.js";
import { loadMcpTools, type McpClientEntry } from "../core/tool/mcp/McpToolLoader.js";
import type { McpClientPort } from "../port/mcp/McpClientPort.js";
import { PostgresAuditStoreAdapter } from "../adapter/postgres/PostgresAuditStoreAdapter.js";
import { PostgresCostStoreAdapter } from "../adapter/postgres/PostgresCostStoreAdapter.js";
import { RedisRateLimitAdapter } from "../adapter/redis/RedisRateLimitAdapter.js";
import { InMemoryToolApprovalStore } from "../core/tool/InMemoryToolApprovalStore.js";
import { setAuditStore } from "./routes/audit.js";
import { setCostRouteDependencies } from "./routes/cost.js";
import { setGlobalAuditStore, appendAudit } from "./security/auditHelpers.js";
import { buildToolSecurityOptions, wrapToolWithSecurity } from "./security/toolSecurityWiring.js";
import type { ToolSecurityOptions } from "../core/tool/ToolSecurityWrapper.js";
import { PostgresVersionStoreAdapter } from "../adapter/postgres/PostgresVersionStoreAdapter.js";
import { seedVersionStoreFromDisk } from "./VersionSeeder.js";
import { setVersionStoreDependencies } from "./routes/versions.js";
import { resolveExecutionOverrides } from "./versioning/sessionVersionBinding.js";
import type { VersionStorePort } from "../port/versioning/VersionStorePort.js";

let bootstrapState: {
  config: ReturnType<typeof loadConfig>;
  toolRegistry: ToolManager;
  skillRegistry: SkillManager;
  settingsManager: SettingsManager;
  container: Container | null;
  tavilyTool: TavilySearchTool;
  directorPrompts: Record<string, string | undefined>;
  hooks: import("../port/hook/AgentHook.js").AgentHook[];
  fileSystem: NodeFileSystemAdapter;
  workspaceManager: WorkspaceManager;
  memoryManager: MemoryManager | null;
  userContextManager: UserContextManager | null;
  dbAdapter: PostgresDatabaseAdapter | null;
  betterAuthAdapter: BetterAuthAdapter | null;
  redisAdapter: TenantIsolationPort | null;
  mqAdapter: RedisMessageQueueAdapter | null;
  eventStore: RedisExecutionEventStoreAdapter | null;
  executionWorker: ExecutionWorker | null;
  durableHitlGateway: DurableHumanReviewGateway | null;
  mcpClients: McpClientPort[];
  mcpToolNames: string[];
  blackboardStore: BlackboardStore;
  tracer: TracerPort;
  traceStore: TraceStorePort | null;
  contextStorage: NodeContextStorageAdapter<TenantContext>;
  wrapTool?: (tool: import("../port/tool/ToolPort.js").ToolPort) => import("../port/tool/ToolPort.js").ToolPort;
  costStore: CostStorePort | null;
  rateLimit: RateLimitPort | null;
  compensateFailureQueue: CompensateFailureQueuePort;
  versionStore: VersionStorePort | null;
} | null = null;

/** Shared runtime logger for the composition root (swap here to re-route core logs). */
const runtimeLogger = new ConsoleLogger();

export function getBootstrapState() {
  return bootstrapState;
}

export function isDirectorReady(): boolean {
  return !!bootstrapState?.container;
}

export async function lateBootstrapDirector(): Promise<void> {
  if (!bootstrapState) throw new Error("Bootstrap not yet called");
  const {
    config,
    toolRegistry,
    skillRegistry,
    settingsManager,
    tavilyTool,
    directorPrompts,
    hooks,
    workspaceManager,
    contextStorage,
    tracer,
    costStore,
    rateLimit,
  } = bootstrapState;

  const settings = settingsManager.getSettings();
  const apiKey = settings.modelApiKey || config.model.apiKey;
  if (!apiKey) throw new Error("API key still not configured");

  const mergedModelConfig = {
    ...config.model,
    apiKey,
    provider: (settings.modelProvider as typeof config.model.provider) || config.model.provider,
    modelName: settings.modelName || config.model.modelName,
    baseUrl: settings.modelBaseUrl || config.model.baseUrl,
    maxTokens: settings.maxTokens || config.limits.modelMaxTokens,
    temperature: settings.temperature,
  };

  const container = new Container(
    { ...config, model: mergedModelConfig },
    toolRegistry,
    skillRegistry,
    { compensateFailureQueue: bootstrapState.compensateFailureQueue },
  );
  bootstrapState.container = container;
  container.model.setTracer?.(tracer);

  const resolveUserId = () => contextStorage.getStore()?.userId;
  const directorModel = createDirectorModel(container.model, config, {
    costStore,
    rateLimit,
    tracer,
    resolveUserId,
  });

  const director = new DirectorAgent({
    model: directorModel,
    agentFactory: container.agentFactory,
    toolRegistry,
    skillRegistry,
    humanReviewGateway: bootstrapState.durableHitlGateway ?? container.humanReviewGateway,
    logger: runtimeLogger,
    hooks,
    prompts: directorPrompts,
    idGenerator: new NodeIdGeneratorAdapter(),
    workspace: workspaceManager,
    limits: {
      queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
      subAgentMaxIterations: config.limits.subAgentMaxIterations,
    },
    memory: {
      archiveEnabled: config.memory.archiveEnabled,
      protectRecentTurns: config.memory.protectRecentTurns,
      maxActiveMessages: config.memory.maxActiveMessages,
      maxTokens: config.limits.contextMaxTokens,
      compressionThreshold: config.limits.contextCompressionThreshold,
    },
    extraToolNames: resolveExposedMcpTools({
      allMcpToolNames: bootstrapState.mcpToolNames,
      exposeMode: config.mcp.exposeMode,
      defaultExposePrefixes: config.mcp.defaultExposePrefixes,
    }),
    mcp: {
      exposeMode: config.mcp.exposeMode,
      defaultExposePrefixes: config.mcp.defaultExposePrefixes,
      skillToolAllowlist: config.mcp.skillToolAllowlist,
      toolNames: bootstrapState.mcpToolNames,
    },
    blackboardStore: bootstrapState.blackboardStore,
    blackboardConfig: bootstrapState.config.blackboard,
    tracer,
    resolveUserId,
    wrapTool: bootstrapState.wrapTool,
      planHard: {
        enabled: config.guards.planHardEnabled,
        maxReplans: config.guards.planMaxReplans,
        rejectUnauthorizedTools: config.guards.planRejectUnauthorizedTools,
        domainToolDefaults: config.guards.planDomainToolDefaults,
      },
      multiAgent: {
        enabled: config.guards.multiAgentEnabled,
        maxFanOut: config.guards.multiAgentMaxFanOut,
        maxDepth: config.guards.multiAgentMaxDepth,
        detectCycles: config.guards.multiAgentDetectCycles,
        handoffMaxChars: config.guards.handoffMaxChars,
        handoffMaxKeyPoints: config.guards.handoffMaxKeyPoints,
        handoffMaxTotalChars: config.guards.handoffMaxTotalChars,
        allowInvoke: config.guards.multiAgentAllowInvoke,
      },
    });

    setDirector(director);
    await bootstrapState.executionWorker?.start();
    setSettingsContainer(container);
  }

  export async function bootstrap() {
  const config = loadConfig();
  const fileSystem = new NodeFileSystemAdapter();
  const contextStorage = new NodeContextStorageAdapter<TenantContext>();

  const settingsManager = new SettingsManager(fileSystem);
  await settingsManager.initialize();

  // If settings.json has no API key yet, seed from env (.env / compose) and persist
  // so subsequent UI reads and rebuilds keep a single source of truth.
  {
    const current = settingsManager.getSettings();
    const seed: Partial<import("../core/settings/SettingsManager.js").AppSettings> = {};
    if (!current.modelApiKey && config.model.apiKey) {
      seed.modelApiKey = config.model.apiKey;
      seed.modelProvider = config.model.provider;
      seed.modelName = config.model.modelName;
      if (config.model.baseUrl) seed.modelBaseUrl = config.model.baseUrl;
    }
    if (!current.tavilyApiKey && config.webSearch.tavilyApiKey) {
      seed.tavilyApiKey = config.webSearch.tavilyApiKey;
      seed.tavilyEnabled = config.webSearch.tavilyEnabled;
    }
    if (Object.keys(seed).length > 0) {
      settingsManager.updateSettings(seed);
      try {
        await settingsManager.save();
      } catch (err) {
        console.warn(
          `[Bootstrap] Failed to persist seeded settings: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  const settings = settingsManager.getSettings();
  let apiKey = settings.modelApiKey || config.model.apiKey;

  // Load prompts from filesystem (composition root responsibility)
  const subAgentPrompts = {
    SystemDesigner: loadPrompt("system_designer"),
    CombatDesigner: loadPrompt("combat_designer"),
    NumericalPlanner: loadPrompt("numerical_planner"),
    GameplayDesigner: loadPrompt("gameplay_designer"),
    ExecutivePlanner: loadPrompt("executive_planner"),
    QAPlanner: loadPrompt("qa_planner"),
  };
  const directorPrompts = {
    querySystem: loadPrompt("query_knowledge") || undefined,
    taskPlanner: loadPrompt("task_planner_freeform") || undefined,
    router: loadPrompt("router_classify") || undefined,
  };

  const toolRegistry = new ToolManager();
  const skillRegistry = new SkillManager();
  loadSkills(skillRegistry);
  loadWorkflows(skillRegistry);

  // Register knowledge tools (grouped for easy enable/disable)
  const wikiTool = new WikiPageTool(config.knowledge.wikiPath, fileSystem);
  const grepTool = new GrepSearchTool(config.knowledge.wikiPath, fileSystem);
  const kgTool = new KnowledgeGraphTool(
    config.knowledge.graphPath || "./knowledge/wiki/graph.json",
    fileSystem
  );
  const tavilyTool = new TavilySearchTool(config.limits.tavilyMaxResults);

  // Apply Tavily config: settings.json takes priority over env
  const tavilyEnabled = settingsManager.isTavilyEnabled() || (config.webSearch.tavilyEnabled && !!config.webSearch.tavilyApiKey);
  const tavilyApiKey = settingsManager.getTavilyApiKey() || config.webSearch.tavilyApiKey;
  if (tavilyEnabled && tavilyApiKey) {
    tavilyTool.setApiKey(tavilyApiKey);
  }

  // Helper to check if a tool group should be registered
  const shouldRegisterGroup = (groupName: string): boolean => {
    if (config.enabledToolGroups.length === 0) return true; // empty = all enabled
    return config.enabledToolGroups.includes(groupName);
  };

  // External / MCP tool resilience: four failure decisions + circuit breaker.
  // Tracer is attached later once tracing is initialized (same options object).
  const toolCircuitRegistry = new ToolCircuitRegistry({
    failureThreshold: config.guards.toolCircuitFailureThreshold,
    cooldownMs: config.guards.toolCircuitCooldownMs,
  });
  const externalToolResilience: ResilientToolOptions = {
    external: true,
    circuitRegistry: toolCircuitRegistry,
    timeoutMs: config.guards.toolTimeoutMs,
    policy: {
      onError: "retry",
      maxRetries: config.guards.toolRetryMaxAttempts,
      retryBackoffMs: config.guards.toolRetryBackoffMs,
      onRetryExhausted: "return_to_llm",
    },
    resolveTool: (name) => toolRegistry.getTool(name),
  };
  const wrapExternalTool = (tool: import("../port/tool/ToolPort.js").ToolPort) =>
    new ResilientToolWrapper(tool, externalToolResilience);

  // ─── MCP (Model Context Protocol) tools ─────────────────────────
  // Connect first so we can decide whether local wiki/knowledge tools are needed.
  const mcpClients: McpClientPort[] = [];
  const mcpToolNames: string[] = [];
  if (config.mcp.enabled) {
    const defaultArgs: Record<string, unknown> = {};
    if (config.mcp.defaultProjectId) {
      defaultArgs.projectId = config.mcp.defaultProjectId;
    } else {
      console.warn(
        "[Bootstrap] MCP_PROJECT_ID is empty — kb_* calls rely on Knowledge Hub JWT currentProjectId. Set MCP_PROJECT_ID explicitly for multi-project agents.",
      );
    }
    const entries: McpClientEntry[] = [];
    for (const server of config.mcp.servers) {
      if (!server.enabled) continue;
      const transportConfig = toMcpTransportConfig(server);
      if (!transportConfig) {
        console.warn(`[Bootstrap] MCP server "${server.name}" skipped: invalid transport config`);
        continue;
      }
      const client = new McpSdkClient(server.name, transportConfig);
      mcpClients.push(client);
      entries.push({ client, toolPrefix: server.toolPrefix, defaultArgs });
    }

    if (entries.length > 0) {
      const { tools, toolNames, failedServers, serverResults } = await loadMcpTools(entries);
      for (const tool of tools) {
        toolRegistry.register(wrapExternalTool(tool));
      }
      mcpToolNames.push(...toolNames);
      console.log(`[Bootstrap] MCP enabled: registered ${tools.length} tools from ${entries.length - failedServers.length}/${entries.length} servers`);
      if (config.mcp.defaultProjectId) {
        console.log(`[Bootstrap] MCP default projectId=${config.mcp.defaultProjectId}`);
      }
      for (const failed of failedServers) {
        console.warn(`[Bootstrap] MCP server "${failed.serverName}" failed to load: ${failed.error}`);
      }
      
      // Build toolName → serverName mapping from serverResults
      const toolServerMap = new Map<string, string>();
      for (const sr of serverResults) {
        if (sr.connected) {
          for (const tn of sr.toolNames) {
            toolServerMap.set(tn, sr.serverName);
          }
        }
      }
      
      // Collect tool descriptors for frontend
      const toolInfos = tools.map((tool) => {
        const descriptor = tool.getDescriptor();
        return {
          name: descriptor.name,
          description: descriptor.description,
          serverName: toolServerMap.get(descriptor.name) || "unknown",
          parameters: descriptor.parameters,
        };
      });
      
      setMCPStatus({
        enabled: true,
        servers: config.mcp.servers.map((s) => ({ name: s.name, transport: s.transport, enabled: s.enabled })),
        toolNames,
        toolCount: tools.length,
        tools: toolInfos,
      });
    } else {
      setMCPStatus({
        enabled: false,
        servers: config.mcp.servers.map((s) => ({ name: s.name, transport: s.transport, enabled: s.enabled })),
        toolNames: [],
        toolCount: 0,
        tools: [],
      });
    }
  } else {
    setMCPStatus({
      enabled: false,
      servers: [],
      toolNames: [],
      toolCount: 0,
      tools: [],
    });
  }

  const mcpKnowledgeHealthy = mcpToolNames.some((name) => /(^|_)kb_search$/.test(name) || name.includes("kb_search"));
  const skipLocalKnowledge =
    config.mcp.disableLocalKnowledgeWhenHealthy && mcpKnowledgeHealthy;

  // Register knowledge tools (group: "knowledge") — skipped when MCP kb_* is healthy.
  if (shouldRegisterGroup("knowledge") && !skipLocalKnowledge) {
    toolRegistry.registerToGroup(new DelegatingTool("wiki_lookup", "在 Wiki 索引中查找主题对应的页面路径。参数: topic (string)", wikiTool, { action: "lookup" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("wiki_read", "读取指定 Wiki 页面的完整内容。参数: pagePath (string)", wikiTool, { action: "read" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("wiki_list", "列出指定分类下的所有 Wiki 页面。参数: category (string)", wikiTool, { action: "list" }), "knowledge");
    toolRegistry.registerToGroup(grepTool, "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_query_node", "查询知识图谱中指定节点的信息。参数: node_id (string)", kgTool, { action: "query_node" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_query_neighbors", "查询知识图谱中指定节点的邻居关系。参数: node_id (string)", kgTool, { action: "query_neighbors" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_list_nodes", "列出知识图谱中指定类型的所有节点。参数: node_type (string, optional)", kgTool, { action: "list_nodes" }), "knowledge");
    console.log(`[Bootstrap] Tool group "knowledge" enabled: ${toolRegistry.getGroupToolNames("knowledge").length} tools`);
  } else if (skipLocalKnowledge) {
    console.log(`[Bootstrap] Tool group "knowledge" skipped — MCP kb_* healthy (set MCP_DISABLE_LOCAL_KNOWLEDGE_WHEN_HEALTHY=false to keep dual sources)`);
  } else {
    console.log(`[Bootstrap] Tool group "knowledge" disabled (not in ENABLED_TOOL_GROUPS)`);
  }

  // Register web search tools (group: "web") — external, circuit-breaker wrapped
  if (shouldRegisterGroup("web")) {
    toolRegistry.registerToGroup(
      wrapExternalTool(
        new DelegatingTool(
          "tavily_search",
          "联网搜索。参数: query (string), max_results (number, default 5), search_depth (string: basic/advanced)",
          tavilyTool,
          { action: "search" },
        ),
      ),
      "web",
    );
    toolRegistry.registerToGroup(
      wrapExternalTool(
        new DelegatingTool(
          "tavily_extract",
          "抓取指定 URL 的网页内容。参数: urls (string, 逗号分隔), query (string, optional)",
          tavilyTool,
          { action: "extract" },
        ),
      ),
      "web",
    );
    console.log(`[Bootstrap] Tool group "web" enabled: ${toolRegistry.getGroupToolNames("web").length} tools (resilient)`);
  } else {
    console.log(`[Bootstrap] Tool group "web" disabled (not in ENABLED_TOOL_GROUPS)`);
  }

  // Configure sub-agent descriptors (tool names and prompts from composition root)
  // Build sub-agent tool names dynamically based on enabled groups
  const subAgentToolNames: string[] = [];
  
  // Add tools from enabled groups
  if (shouldRegisterGroup("knowledge") && !skipLocalKnowledge) {
    subAgentToolNames.push(
      "wiki_lookup", "wiki_read", "wiki_list",
      "grep_search",
      "kg_query_node", "kg_query_neighbors", "kg_list_nodes"
    );
  }
  if (shouldRegisterGroup("web")) {
    subAgentToolNames.push("tavily_search", "tavily_extract");
  }
  if (shouldRegisterGroup("workspace")) {
    subAgentToolNames.push("workspace_read", "workspace_list");
  }
  // Grant shared-blackboard tools to all sub-agents when enabled.
  if (config.blackboard.enabled) {
    subAgentToolNames.push("blackboard_write", "blackboard_read", "blackboard_search", "blackboard_recent");
    // MCP knowledge-hub tools (kb_*) are external/expensive → cache them too.
    for (const name of mcpToolNames) {
      if (!config.blackboard.cachedTools.includes(name)) {
        config.blackboard.cachedTools.push(name);
      }
    }
  }

  // Shared blackboard: session-scoped tool-result cache for multi-agent collaboration.
  const blackboardStore = new BlackboardStore();
  setInterval(() => blackboardStore.evictAll(), 60_000).unref?.();

  // MCP exposure: on_demand only injects defaultExposePrefixes into base descriptors;
  // skill/task-specific MCP tools are merged in DirectorAgent.prepareTaskAgent.
  const mcpExposedForSubAgents = resolveExposedMcpTools({
    allMcpToolNames: mcpToolNames,
    exposeMode: config.mcp.exposeMode,
    defaultExposePrefixes: config.mcp.defaultExposePrefixes,
  });
  setExtraSubAgentToolNames(mcpExposedForSubAgents);
  console.log(
    `[Bootstrap] MCP exposeMode=${config.mcp.exposeMode}: `
    + `${mcpExposedForSubAgents.length}/${mcpToolNames.length} tools in sub-agent base descriptors`,
  );
  configureSubAgentDescriptors(subAgentPrompts, subAgentToolNames, config.limits.subAgentMaxIterations, config.limits.modelMaxTokens);

  // Initialize hooks
  const hooks: import("../port/hook/AgentHook.js").AgentHook[] = [
    new CancellationHook(),
    new LoggingHook(runtimeLogger),
    new ValidationHook(runtimeLogger),
    new IterationBudgetHook(config.limits.iterationBudgetDefault, runtimeLogger),
    new OutputEnforcementHook(),
    new ContextManagementHook({
      compressionThreshold: config.limits.contextCompressionThreshold,
      maxTokens: config.limits.contextMaxTokens,
      protectRecentTurns: config.memory.protectRecentTurns,
      maxActiveMessages: config.memory.maxActiveMessages,
      logger: runtimeLogger,
    }),
  ];
  if (config.mcp.enabled) {
    hooks.push(new KnowledgeFlywheelHook(toolRegistry, runtimeLogger));
    console.log("[Bootstrap] Knowledge flywheel hook enabled (auto report/attribution)");
  }

  // Trace context (separate ALS from tenant) + store/tracer
  const traceContextStorage = new NodeContextStorageAdapter<TraceRuntimeState>();
  const toolApprovalStore = new InMemoryToolApprovalStore();
  let toolSecurityOptions: ToolSecurityOptions | null = null;
  let auditStoreAdapter: PostgresAuditStoreAdapter | null = null;
  let compensateFailureQueue: CompensateFailureQueuePort = new InMemoryCompensateFailureQueue();
  let traceStore: TraceStorePort | null = null;
  let tracer: TracerPort = new NoOpTracer();

  // Long-term memory is PostgreSQL-backed and scoped per authenticated user.
  let memoryManager: MemoryManager | null = null;

  const workspaceManager = new WorkspaceManager("workspace", fileSystem, contextStorage);

  // ─── User System (Multi-Tenant) ──────────────────────────────────
  let userContextManager: UserContextManager | null = null;
  let dbAdapter: PostgresDatabaseAdapter | null = null;
  let betterAuthAdapter: BetterAuthAdapter | null = null;
  let redisAdapter: TenantIsolationPort | null = null;
  let mqAdapter: RedisMessageQueueAdapter | null = null;
  let eventStore: RedisExecutionEventStoreAdapter | null = null;
  let executionWorker: ExecutionWorker | null = null;
  let costStoreAdapter: PostgresCostStoreAdapter | null = null;
  let rateLimitAdapter: RedisRateLimitAdapter | null = null;

  {
    console.log("[Bootstrap] Initializing user system (multi-tenant with Better Auth)...");

    // PostgreSQL
    dbAdapter = new PostgresDatabaseAdapter(config.userSystem.postgresUrl);
    // Schema is owned by drizzle migrations (`pnpm db:migrate`). Startup only verifies connectivity.
    if (!(await dbAdapter.healthCheck())) {
      throw new Error("PostgreSQL health check failed; apply migrations with `pnpm db:migrate`");
    }
    console.log("[Bootstrap] PostgreSQL connected (schema managed by drizzle migrations)");

    if (config.security.auditEnabled) {
      auditStoreAdapter = new PostgresAuditStoreAdapter(dbAdapter, new NodeIdGeneratorAdapter());
      setGlobalAuditStore(auditStoreAdapter);
      setAuditStore(auditStoreAdapter);
      console.log("[Bootstrap] Audit logging enabled (audit_logs → Postgres)");
    } else {
      setGlobalAuditStore(null);
      setAuditStore(null);
    }

    if (config.saga.compensateFailureToAudit && auditStoreAdapter) {
      compensateFailureQueue = new AuditCompensateFailureQueue(
        auditStoreAdapter,
        () => contextStorage.getStore()?.userId ?? "system",
      );
      console.log("[Bootstrap] Saga compensate failures → audit_logs (saga.compensate_failed)");
    } else {
      compensateFailureQueue = new InMemoryCompensateFailureQueue();
    }

    if (config.tracing.enabled) {
      traceStore = new PostgresTraceStoreAdapter(dbAdapter);
      const exporters = config.tracing.consoleExporter ? [new ConsoleTraceExporter()] : [];
      tracer = new DefaultTracer(
        traceStore,
        new NodeIdGeneratorAdapter(),
        traceContextStorage,
        exporters,
      );
      hooks.unshift(new TracingHook(tracer));
      setTraceStore(traceStore);
      console.log("[Bootstrap] Agent tracing enabled (Session/Trace/Span → Postgres)");
    } else {
      setTraceStore(null);
      console.log("[Bootstrap] Agent tracing disabled");
    }

    // Runtime guards (token budget + tool-loop) — share the active tracer when present.
    hooks.push(
      new TokenBudgetHook({
        budget: config.guards.traceTokenBudget,
        multiAgentBudget: config.guards.multiAgentTokenBudget,
        multiAgentEnabled: config.guards.multiAgentEnabled,
        tracer,
      }),
      new ToolLoopDetectorHook({
        windowSize: config.guards.toolLoopWindowSize,
        maxRepeats: config.guards.toolLoopMaxRepeats,
        tracer,
      }),
    );
    // Attach tracer to resilient external tools (same options object used at registration).
    externalToolResilience.tracer = tracer;
    console.log(
      `[Bootstrap] Guards: tokenBudget=${config.guards.traceTokenBudget || "off"} ` +
        `multiAgentToken=${config.guards.multiAgentEnabled ? (config.guards.multiAgentTokenBudget || "off") : "off"} ` +
        `fanOut=${config.guards.multiAgentMaxFanOut} depth=${config.guards.multiAgentMaxDepth} ` +
        `toolLoop=${config.guards.toolLoopMaxRepeats}/${config.guards.toolLoopWindowSize} ` +
        `toolCircuit=${config.guards.toolCircuitFailureThreshold}/${config.guards.toolCircuitCooldownMs}ms ` +
        `toolTimeout=${config.guards.toolTimeoutMs || "off"}ms`,
    );
    console.log(
      `[Bootstrap] Saga: compensate=${config.saga.compensateEnabled ? "on" : "off"} ` +
        `failureAudit=${config.saga.compensateFailureToAudit ? "on" : "off"}`,
    );

    // Better Auth (handles registration, login, sessions, DingTalk SSO)
    const dingtalkConfig = config.userSystem.dingtalk.clientId
      ? config.userSystem.dingtalk
      : undefined;
    betterAuthAdapter = new BetterAuthAdapter(
      {
        postgresUrl: config.userSystem.postgresUrl,
        betterAuthSecret: config.userSystem.betterAuthSecret,
        baseUrl: config.userSystem.betterAuthBaseUrl,
        adminEmailDomains: config.userSystem.adminEmailDomains,
        dingtalk: dingtalkConfig,
        allowEmailPassword: config.userSystem.allowEmailPassword,
        trustedOrigins: config.userSystem.trustedOrigins,
      },
      dbAdapter,
    );
    console.log("[Bootstrap] Better Auth initialized");
    if (config.userSystem.adminEmailDomains) {
      console.log(`[Bootstrap] Admin email domains: ${config.userSystem.adminEmailDomains}`);
    }
    if (dingtalkConfig) {
      console.log("[Bootstrap] DingTalk SSO enabled");
    }
    if (!config.userSystem.allowEmailPassword) {
      console.log("[Bootstrap] Email+password login disabled (SSO only)");
    }

    // Tenant isolation always uses Redis.
    redisAdapter = new RedisTenantIsolationAdapter(
      config.userSystem.redisUrl,
      betterAuthAdapter,
    );
    await (redisAdapter as RedisTenantIsolationAdapter).connect();
    console.log("[Bootstrap] Redis connected (tenant isolation)");

    // User context manager (core layer: tenant-scoped access)
    userContextManager = new UserContextManager(betterAuthAdapter, redisAdapter);

    if (config.longTermMemory.enabled) {
      const memoryPort = new ContextualPostgresLongTermMemoryAdapter(
        dbAdapter,
        new NodeIdGeneratorAdapter(),
        contextStorage,
      );
      memoryManager = new MemoryManager(memoryPort, config.longTermMemory);
      hooks.push(new MemoryInjectionHook(memoryManager, config.longTermMemory.defaultNamespace));
      if (config.longTermMemory.autoExtract) {
        hooks.push(new MemoryExtractionHook(memoryManager, config.longTermMemory.defaultNamespace));
      }
      console.log("[Bootstrap] Long-term memory configured for PostgreSQL (user-scoped)");
    }

    if (config.cost.enabled) {
      costStoreAdapter = new PostgresCostStoreAdapter(
        dbAdapter,
        new NodeIdGeneratorAdapter(),
      );
      rateLimitAdapter = new RedisRateLimitAdapter(config.userSystem.redisUrl, {
        rpmLimitPerUser: config.cost.rpmLimitPerUser,
        tpmLimitPerUser: config.cost.tpmLimitPerUser,
        globalRpmLimit: config.cost.globalRpmLimit,
        globalTpmLimit: config.cost.globalTpmLimit,
        windowMs: config.cost.windowMs,
      });
      await rateLimitAdapter.connect();

      const resolveUserId = () => contextStorage.getStore()?.userId;
      hooks.push(
        new CostAccountingHook({
          enabled: true,
          pricing: {
            inputPricePer1M: config.cost.inputPricePer1M,
            outputPricePer1M: config.cost.outputPricePer1M,
            modelPrices: config.cost.modelPrices,
          },
          costStore: costStoreAdapter,
          defaultModelName: config.model.modelName,
          tracer,
          resolveUserId,
        }),
        new RateLimitHook({
          enabled: config.cost.tpmLimitPerUser > 0 || config.cost.globalTpmLimit > 0,
          rateLimit: rateLimitAdapter,
          tpmEstimatePerCall: config.cost.tpmEstimatePerCall,
          tracer,
          resolveUserId,
        }),
      );

      const rpmEnabled =
        config.cost.rpmLimitPerUser > 0 || config.cost.globalRpmLimit > 0;
      setCostRouteDependencies({
        costStore: costStoreAdapter,
        rateLimit: rateLimitAdapter,
        enabled: true,
      });
      setConsoleRateLimit(new RateLimitGuard(rateLimitAdapter), rpmEnabled);
      console.log(
        `[Bootstrap] Cost tracking enabled: rpm=${config.cost.rpmLimitPerUser || "off"}/user ` +
          `tpm=${config.cost.tpmLimitPerUser || "off"}/user ` +
          `globalRpm=${config.cost.globalRpmLimit || "off"} globalTpm=${config.cost.globalTpmLimit || "off"}`,
      );
    } else {
      setCostRouteDependencies({ costStore: null, rateLimit: null, enabled: false });
      setConsoleRateLimit(null, false);
      console.log("[Bootstrap] Cost tracking disabled");
    }

    // Message queue is a required Redis-backed service.
    mqAdapter = new RedisMessageQueueAdapter(
      config.userSystem.redisUrl,
      new NodeIdGeneratorAdapter(),
      {
        consumerGroup: config.messageQueue.consumerGroup,
        visibilityTimeoutMs: config.messageQueue.visibilityTimeoutMs,
        blockMs: config.messageQueue.blockMs,
        maxRetries: config.messageQueue.maxRetries,
      },
    );
    await mqAdapter.connect();
    console.log("[Bootstrap] Message queue connected");

    eventStore = new RedisExecutionEventStoreAdapter(
      config.userSystem.redisUrl,
      { maxLength: config.execution.eventMaxLength },
    );
    await eventStore.connect();
    console.log("[Bootstrap] Execution event store connected");

    console.log("[Bootstrap] User system enabled: multi-tenant mode with Better Auth");
  }

  // Store bootstrap state for potential late director initialization
  const idGenerator = new NodeIdGeneratorAdapter();
  const sessionRepositoryFactory = (userId: string) =>
    new PostgresSessionRepository(dbAdapter!, userId);
  const executionRepositoryFactory = (userId: string) =>
    new PostgresExecutionRepository(dbAdapter!, userId);

  let versionStoreAdapter: VersionStorePort | null = null;
  if (dbAdapter && config.versioning.enabled) {
    versionStoreAdapter = new PostgresVersionStoreAdapter(dbAdapter, idGenerator);
    await seedVersionStoreFromDisk(versionStoreAdapter);
    setVersionStoreDependencies(versionStoreAdapter, {
      defaultCanaryPercent: config.versioning.defaultCanaryPercent,
    });
    console.log("[Bootstrap] Artifact versioning enabled");
  } else if (config.versioning.enabled) {
    console.warn("[Bootstrap] VERSIONING_ENABLED=true but Postgres is unavailable; versioning disabled");
  }

  executionWorker = new ExecutionWorker({
    queue: mqAdapter!,
    eventStore: eventStore!,
    executionRepositoryFactory,
    sessionRepositoryFactory,
    userContextManager: userContextManager!,
    contextStorage,
    idGenerator,
    maxConcurrentPerUser: config.userSystem.maxConcurrentPerUser,
    pollIntervalMs: config.execution.pollIntervalMs,
    taskTimeoutMs: config.execution.taskTimeoutMs,
    executionOverridesFactory: async (session, userId) => {
      if (!config.versioning.enabled || !versionStoreAdapter) {
        return undefined;
      }
      const model = bootstrapState?.container?.model;
      if (!model) return undefined;
      return resolveExecutionOverrides({
        versionStore: versionStoreAdapter,
        config,
        sessionMeta: session,
        sessionUserId: userId,
        model,
        defaultPrompts: directorPrompts,
        defaultQuerySystemPrompt: directorPrompts.querySystem ?? "",
        fallbackSkillRegistry: skillRegistry,
      });
    },
  });

  bootstrapState = { config, toolRegistry, skillRegistry, settingsManager, container: null, tavilyTool, directorPrompts, hooks, fileSystem, workspaceManager, memoryManager, userContextManager, dbAdapter, betterAuthAdapter, redisAdapter, mqAdapter, eventStore, executionWorker, durableHitlGateway: null, mcpClients, mcpToolNames, blackboardStore, tracer, traceStore, contextStorage, costStore: costStoreAdapter, rateLimit: rateLimitAdapter, compensateFailureQueue, versionStore: versionStoreAdapter };

  const hitlRepositoryFactory = (userId: string) =>
    new PostgresHITLRepository(dbAdapter!, userId);

  if (dbAdapter) {
    toolSecurityOptions = buildToolSecurityOptions({
      config,
      auditStore: auditStoreAdapter,
      approvalStore: toolApprovalStore,
      tenantContextStorage: contextStorage,
      traceContextStorage,
      idGenerator,
      hitlRepositoryFactory,
    });
    toolRegistry.rewrapAll((tool) => wrapToolWithSecurity(tool, toolSecurityOptions!));
    console.log(
      `[Bootstrap] Tool security enabled: irreversibleHitl=${config.security.irreversibleRequireHitl} ` +
        `sandboxKeywords=${config.security.sandboxDenyKeywords.length}`,
    );
  }

  const wrapTool = toolSecurityOptions
    ? (tool: import("../port/tool/ToolPort.js").ToolPort) => wrapToolWithSecurity(tool, toolSecurityOptions!)
    : undefined;
  if (bootstrapState) {
    bootstrapState.wrapTool = wrapTool;
  }

  const durableHitlGateway = new DurableHumanReviewGateway({
    repositoryFactory: hitlRepositoryFactory,
    contextStorage,
    idGenerator,
  });
  if (config.hitl.enabled) {
    durableHitlGateway.configure(
      Object.fromEntries(
        Object.entries(config.hitl.reviewPoints).map(([k, v]) => [
          k,
          { enabled: v, timeout: config.hitl.timeout, autoContinueOnTimeout: config.hitl.autoContinueOnTimeout },
        ]),
      ),
      config.limits.hitlMaxRevisionRounds,
    );
  }
  bootstrapState.durableHitlGateway = durableHitlGateway;

  setConsoleExecutionDependencies({
    sessionRepositoryFactory,
    executionRepositoryFactory,
    queue: mqAdapter!,
    eventStore: eventStore!,
    idGenerator,
    worker: executionWorker,
    maxRetries: config.messageQueue.maxRetries,
    config,
    versionStore: versionStoreAdapter,
  });
  setSessionRepositoryFactory(sessionRepositoryFactory);
  setWorkspaceManager(workspaceManager);
  setHITLRouteDependencies({
    repositoryFactory: hitlRepositoryFactory,
    executionRepositoryFactory,
    sessionRepositoryFactory,
    queue: mqAdapter!,
    tenantPort: redisAdapter!,
    idGenerator,
    maxRetries: config.messageQueue.maxRetries,
    timeoutMs: config.hitl.timeout,
    freshness: new AlwaysFreshHITLCheck(),
    auditStore: auditStoreAdapter,
    toolApprovalStore,
  });

  // Durable HITL timeout sweeper — CAS-safe; concurrent human resume wins or loses cleanly.
  if (config.hitl.enabled && config.hitl.timeoutSweepIntervalMs > 0) {
    const hitlScan = new PostgresHITLTimeoutScanAdapter(dbAdapter!);
    const timer = setInterval(() => {
      void sweepHITLTimeouts({
        scan: hitlScan,
        timeoutMs: config.hitl.timeout,
        policy: config.hitl.timeoutPolicy,
        batchSize: 50,
        applyDeps: {
          repositoryFactory: hitlRepositoryFactory,
          onAutoDecision: async ({ checkpoint, action }) => {
            await appendAudit({
              userId: checkpoint.userId,
              action: "hitl.decision",
              resourceType: "hitl_checkpoint",
              resourceId: checkpoint.id,
              sessionId: checkpoint.sessionId,
              executionId: checkpoint.executionId,
              outcome: action === "reject" ? "denied" : "success",
              detail: {
                reviewPoint: checkpoint.reviewPoint,
                reviewAction: action,
                fallback: true,
                source: "timeout_sweeper",
              },
            });
            if (!checkpoint.executionId) return;
            const execRepo = executionRepositoryFactory(checkpoint.userId);
            const sessionRepo = sessionRepositoryFactory(checkpoint.userId);
            const service = new ExecutionService(execRepo, idGenerator);
            const execution = await execRepo.get(checkpoint.executionId);
            if (!execution) return;
            if (action === "reject") {
              const failed = await service.fail(
                checkpoint.executionId,
                Object.assign(new Error(checkpoint.reviewComment ?? "HITL timeout reject"), {
                  errorClass: "permanent",
                }),
              );
              await sessionRepo.update(execution.sessionId, {
                status: "failed",
                error: failed.errorMessage ?? "HITL timeout reject",
                hitlCheckpointId: checkpoint.id,
              });
              return;
            }
            const resumed = await service.resume(checkpoint.executionId, {
              checkpointId: checkpoint.id,
              reviewAction: action,
              reviewPoint: checkpoint.reviewPoint,
            });
            await sessionRepo.update(execution.sessionId, {
              status: "queued",
              error: "",
              hitlCheckpointId: checkpoint.id,
            });
            await mqAdapter!.publish(
              EXECUTION_QUEUE,
              { executionId: resumed.id, userId: checkpoint.userId },
              { userId: checkpoint.userId, maxRetries: config.messageQueue.maxRetries },
            );
          },
          onExpired: async (checkpoint) => {
            await appendAudit({
              userId: checkpoint.userId,
              action: "hitl.decision",
              resourceType: "hitl_checkpoint",
              resourceId: checkpoint.id,
              sessionId: checkpoint.sessionId,
              executionId: checkpoint.executionId,
              outcome: "denied",
              detail: {
                reviewPoint: checkpoint.reviewPoint,
                reviewAction: "expired",
                fallback: true,
                source: "timeout_sweeper",
              },
            });
            if (!checkpoint.executionId) return;
            const execRepo = executionRepositoryFactory(checkpoint.userId);
            const sessionRepo = sessionRepositoryFactory(checkpoint.userId);
            const service = new ExecutionService(execRepo, idGenerator);
            const execution = await execRepo.get(checkpoint.executionId);
            if (!execution) return;
            const failed = await service.fail(
              checkpoint.executionId,
              Object.assign(new Error(checkpoint.reviewComment ?? "HITL checkpoint expired"), {
                errorClass: "permanent",
              }),
            );
            await sessionRepo.update(execution.sessionId, {
              status: "failed",
              error: failed.errorMessage ?? "HITL checkpoint expired",
              hitlCheckpointId: checkpoint.id,
            });
          },
        },
        onError: (err, checkpointId) => {
          console.error(`[HITL] Timeout sweep error${checkpointId ? ` for ${checkpointId}` : ""}:`, err);
        },
      }).then((stats) => {
        if (stats.applied > 0) {
          console.log(
            `[HITL] Timeout sweep: scanned=${stats.scanned} applied=${stats.applied} skipped=${stats.skipped}`,
          );
        }
      });
    }, config.hitl.timeoutSweepIntervalMs);
    timer.unref?.();
    console.log(
      `[Bootstrap] HITL timeout sweeper enabled: policy=${config.hitl.timeoutPolicy} ` +
        `timeout=${config.hitl.timeout}ms interval=${config.hitl.timeoutSweepIntervalMs}ms`,
    );
  }
  setSettingsManager(settingsManager);
  setTavilyTool(tavilyTool);

  // Wire required user infrastructure.
  if (userContextManager) {
    setUserContextManager(userContextManager);
  }
  if (betterAuthAdapter) {
    setBetterAuthAdapter(betterAuthAdapter);
    setAuthAdapter(betterAuthAdapter);
  }
  if (redisAdapter) {
    setTenantContextStorage(contextStorage);
    setTenantPort(redisAdapter);
  }
  if (dbAdapter) {
    setDatabasePort(dbAdapter);
  }

  // If API key is available, initialize director immediately
  if (apiKey) {
    const mergedModelConfig = {
      ...config.model,
      apiKey,
      provider: (settings.modelProvider as typeof config.model.provider) || config.model.provider,
      modelName: settings.modelName || config.model.modelName,
      baseUrl: settings.modelBaseUrl || config.model.baseUrl,
      maxTokens: settings.maxTokens || config.limits.modelMaxTokens,
      temperature: settings.temperature,
    };

    const container = new Container(
      { ...config, model: mergedModelConfig },
      toolRegistry,
      skillRegistry,
      { compensateFailureQueue },
    );
    bootstrapState.container = container;
    container.model.setTracer?.(tracer);

    const resolveUserId = () => contextStorage.getStore()?.userId;
    const directorModel = createDirectorModel(container.model, config, {
      costStore: bootstrapState.costStore,
      rateLimit: bootstrapState.rateLimit,
      tracer,
      resolveUserId,
    });

    const director = new DirectorAgent({
      model: directorModel,
      agentFactory: container.agentFactory,
      toolRegistry,
      skillRegistry,
      humanReviewGateway: durableHitlGateway,
      logger: runtimeLogger,
      hooks,
      prompts: directorPrompts,
      idGenerator: new NodeIdGeneratorAdapter(),
      workspace: workspaceManager,
      limits: {
        queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
        subAgentMaxIterations: config.limits.subAgentMaxIterations,
        grepSearchResultLimit: config.limits.grepSearchResultLimit,
        webSourceResultLimit: config.limits.webSourceResultLimit,
      },
      memory: {
        archiveEnabled: config.memory.archiveEnabled,
        protectRecentTurns: config.memory.protectRecentTurns,
        maxActiveMessages: config.memory.maxActiveMessages,
        maxTokens: config.limits.contextMaxTokens,
        compressionThreshold: config.limits.contextCompressionThreshold,
      },
      extraToolNames: resolveExposedMcpTools({
        allMcpToolNames: bootstrapState.mcpToolNames,
        exposeMode: config.mcp.exposeMode,
        defaultExposePrefixes: config.mcp.defaultExposePrefixes,
      }),
      mcp: {
        exposeMode: config.mcp.exposeMode,
        defaultExposePrefixes: config.mcp.defaultExposePrefixes,
        skillToolAllowlist: config.mcp.skillToolAllowlist,
        toolNames: bootstrapState.mcpToolNames,
      },
      blackboardStore: bootstrapState.blackboardStore,
      blackboardConfig: bootstrapState.config.blackboard,
      tracer,
      resolveUserId,
      wrapTool,
      planHard: {
        enabled: config.guards.planHardEnabled,
        maxReplans: config.guards.planMaxReplans,
        rejectUnauthorizedTools: config.guards.planRejectUnauthorizedTools,
        domainToolDefaults: config.guards.planDomainToolDefaults,
      },
      multiAgent: {
        enabled: config.guards.multiAgentEnabled,
        maxFanOut: config.guards.multiAgentMaxFanOut,
        maxDepth: config.guards.multiAgentMaxDepth,
        detectCycles: config.guards.multiAgentDetectCycles,
        handoffMaxChars: config.guards.handoffMaxChars,
        handoffMaxKeyPoints: config.guards.handoffMaxKeyPoints,
        handoffMaxTotalChars: config.guards.handoffMaxTotalChars,
        allowInvoke: config.guards.multiAgentAllowInvoke,
      },
    });

    setDirector(director);
    await executionWorker.start();
    setSettingsContainer(container);
  } else {
    console.warn("[Bootstrap] No API key configured. Director not initialized. Configure via /api/settings.");
  }

  const app = createApp();
  return { app, config, container: bootstrapState.container, director: null, settingsManager };
}

/**
 * Hot-reload the DirectorAgent after prompts, skills, or workflows change.
 * Clears caches, re-reads files from disk, and rebuilds the DirectorAgent
 * without restarting the server.
 */
export async function reloadDirector(): Promise<void> {
  if (!bootstrapState) throw new Error("Bootstrap not yet called");
  if (hasActiveExecutions()) {
    throw new Error("无法在任务执行中重载，请等待当前任务完成后再试");
  }

  const { config, toolRegistry, skillRegistry, directorPrompts, hooks, workspaceManager, contextStorage, tracer, costStore, rateLimit } = bootstrapState;

  // 1. Reload prompts
  clearPromptCache();
  const subAgentPrompts = {
    SystemDesigner: loadPrompt("system_designer"),
    CombatDesigner: loadPrompt("combat_designer"),
    NumericalPlanner: loadPrompt("numerical_planner"),
    GameplayDesigner: loadPrompt("gameplay_designer"),
    ExecutivePlanner: loadPrompt("executive_planner"),
    QAPlanner: loadPrompt("qa_planner"),
  };
  directorPrompts.querySystem = loadPrompt("query_knowledge") || undefined;
  directorPrompts.taskPlanner = loadPrompt("task_planner_freeform") || undefined;
  directorPrompts.router = loadPrompt("router_classify") || undefined;

  // 2. Reconfigure sub-agent descriptors
  resetSubAgentDescriptors();
  configureSubAgentDescriptors(
    subAgentPrompts,
    undefined,
    config.limits.subAgentMaxIterations,
    config.limits.modelMaxTokens
  );

  // 3. Reload skills and workflows
  skillRegistry.clear();
  loadSkills(skillRegistry);
  loadWorkflows(skillRegistry);

  // 4. Rebuild DirectorAgent (if container exists)
  if (bootstrapState.container) {
    const resolveUserId = () => contextStorage.getStore()?.userId;
    const directorModel = createDirectorModel(bootstrapState.container.model, config, {
      costStore,
      rateLimit,
      tracer,
      resolveUserId,
    });
    const director = new DirectorAgent({
      model: directorModel,
      agentFactory: bootstrapState.container.agentFactory,
      toolRegistry,
      skillRegistry,
      humanReviewGateway: bootstrapState.durableHitlGateway
        ?? bootstrapState.container.humanReviewGateway,
      logger: runtimeLogger,
      hooks,
      prompts: directorPrompts,
      idGenerator: new NodeIdGeneratorAdapter(),
      workspace: workspaceManager,
      limits: {
        queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
        subAgentMaxIterations: config.limits.subAgentMaxIterations,
      },
      memory: {
        archiveEnabled: config.memory.archiveEnabled,
        protectRecentTurns: config.memory.protectRecentTurns,
        maxActiveMessages: config.memory.maxActiveMessages,
        maxTokens: config.limits.contextMaxTokens,
        compressionThreshold: config.limits.contextCompressionThreshold,
      },
      extraToolNames: resolveExposedMcpTools({
        allMcpToolNames: bootstrapState.mcpToolNames,
        exposeMode: config.mcp.exposeMode,
        defaultExposePrefixes: config.mcp.defaultExposePrefixes,
      }),
      mcp: {
        exposeMode: config.mcp.exposeMode,
        defaultExposePrefixes: config.mcp.defaultExposePrefixes,
        skillToolAllowlist: config.mcp.skillToolAllowlist,
        toolNames: bootstrapState.mcpToolNames,
      },
      blackboardStore: bootstrapState.blackboardStore,
      blackboardConfig: bootstrapState.config.blackboard,
      tracer,
      resolveUserId,
      wrapTool: bootstrapState.wrapTool,
      planHard: {
        enabled: config.guards.planHardEnabled,
        maxReplans: config.guards.planMaxReplans,
        rejectUnauthorizedTools: config.guards.planRejectUnauthorizedTools,
        domainToolDefaults: config.guards.planDomainToolDefaults,
      },
      multiAgent: {
        enabled: config.guards.multiAgentEnabled,
        maxFanOut: config.guards.multiAgentMaxFanOut,
        maxDepth: config.guards.multiAgentMaxDepth,
        detectCycles: config.guards.multiAgentDetectCycles,
        handoffMaxChars: config.guards.handoffMaxChars,
        handoffMaxKeyPoints: config.guards.handoffMaxKeyPoints,
        handoffMaxTotalChars: config.guards.handoffMaxTotalChars,
        allowInvoke: config.guards.multiAgentAllowInvoke,
      },
    });
    setDirector(director);
    console.log("[Bootstrap] Director hot-reloaded (prompts, skills, workflows)");
  } else {
    console.log("[Bootstrap] Prompts/skills/workflows reloaded (Director not yet initialized)");
  }
}

