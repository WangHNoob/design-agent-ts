import { createApp } from "./app.js";
import { loadConfig } from "../config/loadConfig.js";
import { Container } from "./Container.js";
import { ToolManager } from "../core/tool/ToolManager.js";
import { SkillManager } from "../core/skill/SkillManager.js";
import { loadSkills } from "./SkillLoader.js";
import { loadWorkflows } from "./WorkflowLoader.js";
import { DirectorAgent } from "../core/agent/director/DirectorAgent.js";
import { configureSubAgentDescriptors, resetSubAgentDescriptors, setExtraSubAgentToolNames } from "../core/agent/subagents/SubAgentFactory.js";
import { setDirector, setConsoleExecutionDependencies, hasActiveExecutions } from "./routes/console.js";
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
import { ToolLoopDetectorHook } from "../core/hook/ToolLoopDetectorHook.js";
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
import { PostgresHITLRepository } from "../adapter/postgres/PostgresHITLRepository.js";
import { ContextualPostgresLongTermMemoryAdapter } from "../adapter/postgres/ContextualPostgresLongTermMemoryAdapter.js";
import { BetterAuthAdapter } from "../adapter/betterauth/BetterAuthAdapter.js";
import { RedisTenantIsolationAdapter } from "../adapter/redis/RedisTenantIsolationAdapter.js";
import type { TenantIsolationPort } from "../port/user/TenantIsolationPort.js";
import type { TenantContext } from "../port/user/TenantIsolationPort.js";
import { RedisMessageQueueAdapter } from "../adapter/redis/RedisMessageQueueAdapter.js";
import { RedisExecutionEventStoreAdapter } from "../adapter/redis/RedisExecutionEventStoreAdapter.js";
import { UserContextManager } from "../core/user/UserContextManager.js";
import { ExecutionWorker } from "./worker/ExecutionWorker.js";
import { setAuthAdapter, setTenantPort, setTenantContextStorage, setDatabasePort } from "./app.js";
import { usersRoute, setUserContextManager, setBetterAuthAdapter } from "./routes/users.js";
import { McpSdkClient, type McpTransportConfig } from "../adapter/mcp/McpSdkClient.js";
import { loadMcpTools, type McpClientEntry } from "../core/tool/mcp/McpToolLoader.js";
import type { McpClientPort } from "../port/mcp/McpClientPort.js";

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
} | null = null;

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

  const container = new Container({ ...config, model: mergedModelConfig }, toolRegistry, skillRegistry);
  bootstrapState.container = container;

  const director = new DirectorAgent({
    model: container.model,
    agentFactory: container.agentFactory,
    toolRegistry,
    skillRegistry,
    humanReviewGateway: bootstrapState.durableHitlGateway ?? container.humanReviewGateway,
    hooks,
    prompts: directorPrompts,
    idGenerator: new NodeIdGeneratorAdapter(),
    workspace: workspaceManager,
    limits: {
      queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
      subAgentMaxIterations: config.limits.subAgentMaxIterations,
    },
    extraToolNames: bootstrapState.mcpToolNames,
    blackboardStore: bootstrapState.blackboardStore,
    blackboardConfig: bootstrapState.config.blackboard,
    tracer,
    resolveUserId: () => contextStorage.getStore()?.userId,
  });

  setDirector(director);
  await bootstrapState.executionWorker?.start();
  setSettingsContainer(container);
}

export async function bootstrap() {
  const config = loadConfig();
  const fileSystem = new NodeFileSystemAdapter();
  const contextStorage = new NodeContextStorageAdapter<TenantContext>();

  let apiKey = config.model.apiKey;

  const settingsManager = new SettingsManager(fileSystem);
  await settingsManager.initialize();

  const settings = settingsManager.getSettings();
  if (settings.modelApiKey) {
    apiKey = settings.modelApiKey;
  }

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

  // Register knowledge tools (group: "knowledge")
  if (shouldRegisterGroup("knowledge")) {
    toolRegistry.registerToGroup(new DelegatingTool("wiki_lookup", "在 Wiki 索引中查找主题对应的页面路径。参数: topic (string)", wikiTool, { action: "lookup" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("wiki_read", "读取指定 Wiki 页面的完整内容。参数: pagePath (string)", wikiTool, { action: "read" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("wiki_list", "列出指定分类下的所有 Wiki 页面。参数: category (string)", wikiTool, { action: "list" }), "knowledge");
    toolRegistry.registerToGroup(grepTool, "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_query_node", "查询知识图谱中指定节点的信息。参数: node_id (string)", kgTool, { action: "query_node" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_query_neighbors", "查询知识图谱中指定节点的邻居关系。参数: node_id (string)", kgTool, { action: "query_neighbors" }), "knowledge");
    toolRegistry.registerToGroup(new DelegatingTool("kg_list_nodes", "列出知识图谱中指定类型的所有节点。参数: node_type (string, optional)", kgTool, { action: "list_nodes" }), "knowledge");
    console.log(`[Bootstrap] Tool group "knowledge" enabled: ${toolRegistry.getGroupToolNames("knowledge").length} tools`);
  } else {
    console.log(`[Bootstrap] Tool group "knowledge" disabled (not in ENABLED_TOOL_GROUPS)`);
  }

  // Register web search tools (group: "web")
  if (shouldRegisterGroup("web")) {
    toolRegistry.registerToGroup(new DelegatingTool("tavily_search", "联网搜索。参数: query (string), max_results (number, default 5), search_depth (string: basic/advanced)", tavilyTool, { action: "search" }), "web");
    toolRegistry.registerToGroup(new DelegatingTool("tavily_extract", "抓取指定 URL 的网页内容。参数: urls (string, 逗号分隔), query (string, optional)", tavilyTool, { action: "extract" }), "web");
    console.log(`[Bootstrap] Tool group "web" enabled: ${toolRegistry.getGroupToolNames("web").length} tools`);
  } else {
    console.log(`[Bootstrap] Tool group "web" disabled (not in ENABLED_TOOL_GROUPS)`);
  }

  // ─── MCP (Model Context Protocol) tools ─────────────────────────
  // Connect to external MCP servers (e.g. Knowledge Hub) and register their
  // tools. A single server failing does not block startup (degraded + audited).
  const mcpClients: McpClientPort[] = [];
  const mcpToolNames: string[] = [];
  if (config.mcp.enabled) {
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
      entries.push({ client, toolPrefix: server.toolPrefix });
    }

    if (entries.length > 0) {
      const { tools, toolNames, failedServers, serverResults } = await loadMcpTools(entries);
      for (const tool of tools) {
        toolRegistry.register(tool);
      }
      mcpToolNames.push(...toolNames);
      console.log(`[Bootstrap] MCP enabled: registered ${tools.length} tools from ${entries.length - failedServers.length}/${entries.length} servers`);
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

  // Configure sub-agent descriptors (tool names and prompts from composition root)
  // Build sub-agent tool names dynamically based on enabled groups
  const subAgentToolNames: string[] = [];
  
  // Add tools from enabled groups
  if (shouldRegisterGroup("knowledge")) {
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

  // Grant MCP tools to all sub-agents (persists across hot-reload resets).
  setExtraSubAgentToolNames(mcpToolNames);
  configureSubAgentDescriptors(subAgentPrompts, subAgentToolNames, config.limits.subAgentMaxIterations, config.limits.modelMaxTokens);

  // Initialize hooks
  const hooks: import("../port/hook/AgentHook.js").AgentHook[] = [
    new LoggingHook(),
    new ValidationHook(),
    new IterationBudgetHook(config.limits.iterationBudgetDefault),
    new OutputEnforcementHook(),
    new ContextManagementHook(config.limits.contextCompressionThreshold, config.limits.contextMaxTokens),
  ];

  // Trace context (separate ALS from tenant) + store/tracer
  const traceContextStorage = new NodeContextStorageAdapter<TraceRuntimeState>();
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

  {
    console.log("[Bootstrap] Initializing user system (multi-tenant with Better Auth)...");

    // PostgreSQL
    dbAdapter = new PostgresDatabaseAdapter(config.userSystem.postgresUrl);
    // Schema is owned by drizzle migrations (`pnpm db:migrate`). Startup only verifies connectivity.
    if (!(await dbAdapter.healthCheck())) {
      throw new Error("PostgreSQL health check failed; apply migrations with `pnpm db:migrate`");
    }
    console.log("[Bootstrap] PostgreSQL connected (schema managed by drizzle migrations)");

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
        tracer,
      }),
      new ToolLoopDetectorHook({
        windowSize: config.guards.toolLoopWindowSize,
        maxRepeats: config.guards.toolLoopMaxRepeats,
        tracer,
      }),
    );
    console.log(
      `[Bootstrap] Guards: tokenBudget=${config.guards.traceTokenBudget || "off"} ` +
        `toolLoop=${config.guards.toolLoopMaxRepeats}/${config.guards.toolLoopWindowSize}`,
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
  });

  bootstrapState = { config, toolRegistry, skillRegistry, settingsManager, container: null, tavilyTool, directorPrompts, hooks, fileSystem, workspaceManager, memoryManager, userContextManager, dbAdapter, betterAuthAdapter, redisAdapter, mqAdapter, eventStore, executionWorker, durableHitlGateway: null, mcpClients, mcpToolNames, blackboardStore, tracer, traceStore, contextStorage };

  const hitlRepositoryFactory = (userId: string) =>
    new PostgresHITLRepository(dbAdapter!, userId);
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
  });
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

    const container = new Container({ ...config, model: mergedModelConfig }, toolRegistry, skillRegistry);
    bootstrapState.container = container;

    const director = new DirectorAgent({
      model: container.model,
      agentFactory: container.agentFactory,
      toolRegistry,
      skillRegistry,
      humanReviewGateway: durableHitlGateway,
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
      extraToolNames: bootstrapState.mcpToolNames,
      blackboardStore: bootstrapState.blackboardStore,
      blackboardConfig: bootstrapState.config.blackboard,
      tracer,
      resolveUserId: () => contextStorage.getStore()?.userId,
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

  const { config, toolRegistry, skillRegistry, directorPrompts, hooks, workspaceManager, contextStorage, tracer } = bootstrapState;

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
    const director = new DirectorAgent({
      model: bootstrapState.container.model,
      agentFactory: bootstrapState.container.agentFactory,
      toolRegistry,
      skillRegistry,
      humanReviewGateway: bootstrapState.durableHitlGateway
        ?? bootstrapState.container.humanReviewGateway,
      hooks,
      prompts: directorPrompts,
      idGenerator: new NodeIdGeneratorAdapter(),
      workspace: workspaceManager,
      limits: {
        queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
        subAgentMaxIterations: config.limits.subAgentMaxIterations,
      },
      extraToolNames: bootstrapState.mcpToolNames,
      blackboardStore: bootstrapState.blackboardStore,
      blackboardConfig: bootstrapState.config.blackboard,
      tracer,
      resolveUserId: () => contextStorage.getStore()?.userId,
    });
    setDirector(director);
    console.log("[Bootstrap] Director hot-reloaded (prompts, skills, workflows)");
  } else {
    console.log("[Bootstrap] Prompts/skills/workflows reloaded (Director not yet initialized)");
  }
}

/**
 * Translate a validated McpServerConfig into the adapter's transport config.
 * Returns null if required fields for the transport are missing (defensive —
 * validateConfig already enforces these).
 */
function toMcpTransportConfig(
  server: import("../config/FrameworkConfig.js").McpServerConfig,
): McpTransportConfig | null {
  switch (server.transport) {
    case "stdio":
      if (!server.command) return null;
      return { transport: "stdio", command: server.command, args: server.args, env: server.env };
    case "sse":
      if (!server.url) return null;
      return { transport: "sse", url: server.url, headers: server.headers };
    case "http":
      if (!server.url) return null;
      return { transport: "http", url: server.url, headers: server.headers };
    default:
      return null;
  }
}
