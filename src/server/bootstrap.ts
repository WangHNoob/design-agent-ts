import { createApp } from "./app.js";
import { loadConfig } from "../config/loadConfig.js";
import { Container } from "./Container.js";
import { ToolManager } from "../core/tool/ToolManager.js";
import { SkillManager } from "../core/skill/SkillManager.js";
import { loadSkills } from "./SkillLoader.js";
import { loadWorkflows } from "./WorkflowLoader.js";
import { DirectorAgent } from "../core/agent/director/DirectorAgent.js";
import { configureSubAgentDescriptors, resetSubAgentDescriptors, setExtraSubAgentToolNames } from "../core/agent/subagents/SubAgentFactory.js";
import { setDirector, setConsoleSessionManager, setConsoleHITLManager, hasActiveExecutions } from "./routes/console.js";
import { setSessionManager, setWorkspaceManager } from "./routes/sessions.js";
import { setHITLManager } from "./routes/hitl.js";
import { SessionManager } from "../core/session/SessionManager.js";
import { HITLManager } from "../core/hitl/HITLManager.js";
import { LoggingHook } from "../core/hook/LoggingHook.js";
import { ValidationHook } from "../core/hook/ValidationHook.js";
import { IterationBudgetHook } from "../core/hook/IterationBudgetHook.js";
import { OutputEnforcementHook } from "../core/hook/OutputEnforcementHook.js";
import { ContextManagementHook } from "../core/hook/ContextManagementHook.js";
import { WikiPageTool } from "../core/tool/knowledge/WikiPageTool.js";
import { GrepSearchTool } from "../core/tool/knowledge/GrepSearchTool.js";
import { KnowledgeGraphTool } from "../core/tool/knowledge/KnowledgeGraphTool.js";
import { TavilySearchTool } from "../adapter/tavily/TavilySearchTool.js";
import { DelegatingTool } from "../core/tool/DelegatingTool.js";
import { loadPrompt, clearPromptCache } from "./PromptLoader.js";
import { SettingsManager } from "../core/settings/SettingsManager.js";
import { setSettingsManager, setSettingsContainer, setTavilyTool } from "./routes/settings.js";
import { NodeFileSystemAdapter } from "../adapter/fs/NodeFileSystemAdapter.js";
import { NodeIdGeneratorAdapter } from "../adapter/infra/NodeIdGeneratorAdapter.js";
import { WorkspaceManager } from "../core/workspace/WorkspaceManager.js";
import { FileBasedLongTermMemoryAdapter } from "../adapter/memory/FileBasedLongTermMemoryAdapter.js";
import { MemoryManager } from "../core/memory/MemoryManager.js";
import { MemoryExtractionHook } from "../core/hook/MemoryExtractionHook.js";
import { MemoryInjectionHook } from "../core/hook/MemoryInjectionHook.js";
import { PostgresDatabaseAdapter } from "../adapter/postgres/PostgresDatabaseAdapter.js";
import { PostgresLongTermMemoryAdapter } from "../adapter/postgres/PostgresLongTermMemoryAdapter.js";
import { PostgresSessionRepository } from "../adapter/postgres/PostgresSessionRepository.js";
import { BetterAuthAdapter } from "../adapter/betterauth/BetterAuthAdapter.js";
import { RedisTenantIsolationAdapter } from "../adapter/redis/RedisTenantIsolationAdapter.js";
import { InMemoryTenantIsolationAdapter } from "../core/user/InMemoryTenantIsolationAdapter.js";
import type { TenantIsolationPort } from "../port/user/TenantIsolationPort.js";
import { RedisMessageQueueAdapter } from "../adapter/redis/RedisMessageQueueAdapter.js";
import { UserContextManager } from "../core/user/UserContextManager.js";
import { setAuthAdapter, setTenantPort, setDatabasePort } from "./app.js";
import { setUserIdScopedStores } from "./middleware/auth.js";
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
  mcpClients: McpClientPort[];
  mcpToolNames: string[];
} | null = null;

export function getBootstrapState() {
  return bootstrapState;
}

export function isDirectorReady(): boolean {
  return !!bootstrapState?.container;
}

export async function lateBootstrapDirector(): Promise<void> {
  if (!bootstrapState) throw new Error("Bootstrap not yet called");
  const { config, toolRegistry, skillRegistry, settingsManager, tavilyTool, directorPrompts, hooks, workspaceManager } = bootstrapState;

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

  if (container.humanReviewGateway.configure && config.hitl.enabled) {
    container.humanReviewGateway.configure(
      Object.fromEntries(
        Object.entries(config.hitl.reviewPoints).map(([k, v]) => [
          k,
          { enabled: v, timeout: config.hitl.timeout, autoContinueOnTimeout: config.hitl.autoContinueOnTimeout },
        ])
      ),
      config.limits.hitlMaxRevisionRounds
    );
  }

  const director = new DirectorAgent({
    model: container.model,
    agentFactory: container.agentFactory,
    toolRegistry,
    skillRegistry,
    humanReviewGateway: container.humanReviewGateway,
    hooks,
    prompts: directorPrompts,
    idGenerator: new NodeIdGeneratorAdapter(),
    workspace: workspaceManager,
    limits: {
      queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
      subAgentMaxIterations: config.limits.subAgentMaxIterations,
    },
    extraToolNames: bootstrapState.mcpToolNames,
  });

  setDirector(director);
  setSettingsContainer(container);
}

export async function bootstrap() {
  const config = loadConfig();
  const fileSystem = new NodeFileSystemAdapter();

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

  // Register knowledge tools
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

  // Register with names matching prompt expectations
  toolRegistry.register(new DelegatingTool("wiki_lookup", "在 Wiki 索引中查找主题对应的页面路径。参数: topic (string)", wikiTool, { action: "lookup" }));
  toolRegistry.register(new DelegatingTool("wiki_read", "读取指定 Wiki 页面的完整内容。参数: pagePath (string)", wikiTool, { action: "read" }));
  toolRegistry.register(new DelegatingTool("wiki_list", "列出指定分类下的所有 Wiki 页面。参数: category (string)", wikiTool, { action: "list" }));
  toolRegistry.register(grepTool);
  toolRegistry.register(new DelegatingTool("kg_query_node", "查询知识图谱中指定节点的信息。参数: node_id (string)", kgTool, { action: "query_node" }));
  toolRegistry.register(new DelegatingTool("kg_query_neighbors", "查询知识图谱中指定节点的邻居关系。参数: node_id (string)", kgTool, { action: "query_neighbors" }));
  toolRegistry.register(new DelegatingTool("kg_list_nodes", "列出知识图谱中指定类型的所有节点。参数: node_type (string, optional)", kgTool, { action: "list_nodes" }));
  toolRegistry.register(new DelegatingTool("tavily_search", "联网搜索。参数: query (string), max_results (number, default 5), search_depth (string: basic/advanced)", tavilyTool, { action: "search" }));
  toolRegistry.register(new DelegatingTool("tavily_extract", "抓取指定 URL 的网页内容。参数: urls (string, 逗号分隔), query (string, optional)", tavilyTool, { action: "extract" }));

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
      const { tools, toolNames, failedServers } = await loadMcpTools(entries);
      for (const tool of tools) {
        toolRegistry.register(tool);
      }
      mcpToolNames.push(...toolNames);
      console.log(`[Bootstrap] MCP enabled: registered ${tools.length} tools from ${entries.length - failedServers.length}/${entries.length} servers`);
      for (const failed of failedServers) {
        console.warn(`[Bootstrap] MCP server "${failed.serverName}" failed to load: ${failed.error}`);
      }
    }
  }

  // Configure sub-agent descriptors (tool names and prompts from composition root)
  const subAgentToolNames = [
    "wiki_lookup", "wiki_read", "wiki_list",
    "grep_search",
    "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
    "tavily_search", "tavily_extract",
    "workspace_read", "workspace_list",
  ];
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

  // Initialize long-term memory (composition root: wire adapter → core)
  let memoryManager: MemoryManager | null = null;
  if (config.longTermMemory.enabled) {
    const ltmAdapter = new FileBasedLongTermMemoryAdapter(
      config.longTermMemory.storagePath,
      fileSystem,
      new NodeIdGeneratorAdapter(),
    );
    memoryManager = new MemoryManager(ltmAdapter, {
      defaultNamespace: config.longTermMemory.defaultNamespace,
      maxContextMemories: config.longTermMemory.maxContextMemories,
      minImportanceForContext: config.longTermMemory.minImportanceForContext,
      autoExtract: config.longTermMemory.autoExtract,
      autoPrune: config.longTermMemory.autoPrune,
      maxAgeMs: config.longTermMemory.maxAgeMs,
      pruneBelowImportance: config.longTermMemory.pruneBelowImportance,
    });

    // Memory injection hook runs at pre_reasoning (priority 60, before compression)
    hooks.push(new MemoryInjectionHook(memoryManager, config.longTermMemory.defaultNamespace));
    // Memory extraction hook runs at post_agent_call (priority 200, after other hooks)
    if (config.longTermMemory.autoExtract) {
      hooks.push(new MemoryExtractionHook(memoryManager, config.longTermMemory.defaultNamespace));
    }

    console.log(`[Bootstrap] Long-term memory enabled: storage=${config.longTermMemory.storagePath}, namespace=${config.longTermMemory.defaultNamespace}`);
  }

  const workspaceManager = new WorkspaceManager("workspace", fileSystem);

  // ─── User System (Multi-Tenant) ──────────────────────────────────
  let userContextManager: UserContextManager | null = null;
  let dbAdapter: PostgresDatabaseAdapter | null = null;
  let betterAuthAdapter: BetterAuthAdapter | null = null;
  let redisAdapter: TenantIsolationPort | null = null;
  let mqAdapter: RedisMessageQueueAdapter | null = null;

  if (config.userSystem.enabled) {
    console.log("[Bootstrap] Initializing user system (multi-tenant with Better Auth)...");

    // PostgreSQL
    dbAdapter = new PostgresDatabaseAdapter(config.userSystem.postgresUrl);
    if (config.userSystem.autoInitSchema) {
      await dbAdapter.initializeSchema();
      console.log("[Bootstrap] PostgreSQL schema initialized");
    }

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

    // Tenant isolation: Redis (caching/locking/concurrency) or in-process fallback
    if (config.userSystem.redisEnabled) {
      redisAdapter = new RedisTenantIsolationAdapter(
        config.userSystem.redisUrl,
        betterAuthAdapter,
      );
      await (redisAdapter as RedisTenantIsolationAdapter).connect();
      console.log("[Bootstrap] Redis connected (tenant isolation)");
    } else {
      redisAdapter = new InMemoryTenantIsolationAdapter(betterAuthAdapter);
      console.log("[Bootstrap] Redis disabled — using in-process tenant isolation (single-instance)");
    }

    // User context manager (core layer: tenant-scoped access)
    userContextManager = new UserContextManager(betterAuthAdapter, redisAdapter);

    // Replace file-based LTM with PostgreSQL-backed LTM per user
    if (config.longTermMemory.enabled) {
      console.log("[Bootstrap] Long-term memory using PostgreSQL (user-scoped)");
    }

    // Message Queue (requires Redis)
    if (config.messageQueue.enabled && config.userSystem.redisEnabled) {
      mqAdapter = new RedisMessageQueueAdapter(
        config.userSystem.redisUrl,
        new NodeIdGeneratorAdapter(),
        { consumerGroup: config.messageQueue.consumerGroup, pollIntervalMs: config.messageQueue.pollIntervalMs },
      );
      await mqAdapter.connect();
      await mqAdapter.start();
      console.log("[Bootstrap] Message queue started");
    } else if (config.messageQueue.enabled) {
      console.log("[Bootstrap] Message queue disabled (requires Redis)");
    }

    console.log("[Bootstrap] User system enabled: multi-tenant mode with Better Auth");
  }

  // Store bootstrap state for potential late director initialization
  bootstrapState = { config, toolRegistry, skillRegistry, settingsManager, container: null, tavilyTool, directorPrompts, hooks, fileSystem, workspaceManager, memoryManager, userContextManager, dbAdapter, betterAuthAdapter, redisAdapter, mqAdapter, mcpClients, mcpToolNames };

  const sessionManager = new SessionManager(fileSystem, "sessions", config.limits.sessionListLimit);
  await sessionManager.initialize();

  const hitlManager = new HITLManager(fileSystem);
  await hitlManager.initialize();

  setUserIdScopedStores(sessionManager, workspaceManager, hitlManager);

  setConsoleSessionManager(sessionManager);
  setConsoleHITLManager(hitlManager);
  setSessionManager(sessionManager);
  setWorkspaceManager(workspaceManager);
  setHITLManager(hitlManager);
  setSettingsManager(settingsManager);
  setTavilyTool(tavilyTool);

  // Wire user context manager (if user system is enabled)
  if (userContextManager) {
    setUserContextManager(userContextManager);
  }
  if (betterAuthAdapter) {
    setBetterAuthAdapter(betterAuthAdapter);
    setAuthAdapter(betterAuthAdapter);
  }
  if (redisAdapter) {
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

    if (container.humanReviewGateway.configure && config.hitl.enabled) {
      container.humanReviewGateway.configure(
        Object.fromEntries(
          Object.entries(config.hitl.reviewPoints).map(([k, v]) => [
            k,
            { enabled: v, timeout: config.hitl.timeout, autoContinueOnTimeout: config.hitl.autoContinueOnTimeout },
          ])
        ),
        config.limits.hitlMaxRevisionRounds
      );
    }

    const director = new DirectorAgent({
      model: container.model,
      agentFactory: container.agentFactory,
      toolRegistry,
      skillRegistry,
      humanReviewGateway: container.humanReviewGateway,
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
    });

    setDirector(director);
    setSettingsContainer(container);
  } else {
    console.warn("[Bootstrap] No API key configured. Director not initialized. Configure via /api/settings.");
  }

  const app = createApp();
  return { app, config, container: bootstrapState.container, director: null, sessionManager, hitlManager, settingsManager };
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

  const { config, toolRegistry, skillRegistry, directorPrompts, hooks, workspaceManager } = bootstrapState;

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
      humanReviewGateway: bootstrapState.container.humanReviewGateway,
      hooks,
      prompts: directorPrompts,
      idGenerator: new NodeIdGeneratorAdapter(),
      workspace: workspaceManager,
      limits: {
        queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
        subAgentMaxIterations: config.limits.subAgentMaxIterations,
      },
      extraToolNames: bootstrapState.mcpToolNames,
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
