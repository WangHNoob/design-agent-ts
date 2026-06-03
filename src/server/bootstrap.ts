import { createApp } from "./app.js";
import { loadConfig } from "../config/loadConfig.js";
import { Container } from "./Container.js";
import { ToolManager } from "../core/tool/ToolManager.js";
import { SkillManager } from "../core/skill/SkillManager.js";
import { DirectorAgent } from "../core/agent/director/DirectorAgent.js";
import { configureSubAgentDescriptors } from "../core/agent/subagents/SubAgentFactory.js";
import { setDirector, setConsoleSessionManager, setConsoleHITLManager } from "./routes/console.js";
import { setSessionManager } from "./routes/sessions.js";
import { setHITLManager } from "./routes/hitl.js";
import { SessionManager } from "../core/session/SessionManager.js";
import { HITLManager } from "../core/hitl/HITLManager.js";
import { LoggingHook } from "../core/hook/LoggingHook.js";
import { ValidationHook } from "../core/hook/ValidationHook.js";
import { IterationBudgetHook } from "../core/hook/IterationBudgetHook.js";
import { OutputEnforcementHook } from "../core/hook/OutputEnforcementHook.js";
import { ContextManagementHook } from "../core/hook/ContextManagementHook.js";
import { O11yReportingHook } from "../core/hook/O11yReportingHook.js";
import { setSpanReporter, setTraceReporter } from "../core/o11y/O11yTraceBridge.js";
import { setRuntimeStatusReporter as setRuntimeBridgeReporter } from "../core/o11y/O11yRuntimeBridge.js";
import { BatchSpanReporter } from "../core/o11y/BatchSpanReporter.js";
import { BatchLogReporter } from "../core/o11y/BatchLogReporter.js";
import {
  NoOpTraceReporter,
  NoOpSpanReporter,
  NoOpLogReporter,
  NoOpRuntimeStatusReporter,
} from "../core/o11y/NoOpReporter.js";
import { HttpTraceReporter } from "../adapter/o11y/HttpTraceReporter.js";
import { HttpSpanReporter } from "../adapter/o11y/HttpSpanReporter.js";
import { HttpLogReporter } from "../adapter/o11y/HttpLogReporter.js";
import { HttpRuntimeStatusReporter } from "../adapter/o11y/HttpRuntimeStatusReporter.js";
import { WikiPageTool } from "../core/tool/knowledge/WikiPageTool.js";
import { GrepSearchTool } from "../core/tool/knowledge/GrepSearchTool.js";
import { KnowledgeGraphTool } from "../core/tool/knowledge/KnowledgeGraphTool.js";
import { TavilySearchTool } from "../adapter/tavily/TavilySearchTool.js";
import { DelegatingTool } from "../core/tool/DelegatingTool.js";
import { loadPrompt } from "./PromptLoader.js";
import { SettingsManager } from "../core/settings/SettingsManager.js";
import { setSettingsManager, setSettingsContainer, setTavilyTool } from "./routes/settings.js";
import { NodeFileSystemAdapter } from "../adapter/fs/NodeFileSystemAdapter.js";
import { NodeIdGeneratorAdapter } from "../adapter/infra/NodeIdGeneratorAdapter.js";
import { NodeContextStorageAdapter } from "../adapter/infra/NodeContextStorageAdapter.js";
import { configureIdGenerator } from "../core/o11y/O11ySpan.js";
import { configureContextStorage } from "../core/o11y/O11yContext.js";

let bootstrapState: {
  config: ReturnType<typeof loadConfig>;
  toolRegistry: ToolManager;
  skillRegistry: SkillManager;
  settingsManager: SettingsManager;
  container: Container | null;
  tavilyTool: TavilySearchTool;
  directorPrompts: Record<string, string | undefined>;
  hooks: import("../port/hook/AgentHook.js").AgentHook[];
} | null = null;

export function getBootstrapState() {
  return bootstrapState;
}

export function isDirectorReady(): boolean {
  return !!bootstrapState?.container;
}

export async function lateBootstrapDirector(): Promise<void> {
  if (!bootstrapState) throw new Error("Bootstrap not yet called");
  const { config, toolRegistry, skillRegistry, settingsManager, tavilyTool, directorPrompts, hooks } = bootstrapState;

  const settings = settingsManager.getSettings();
  const apiKey = settings.modelApiKey || config.model.apiKey;
  if (!apiKey) throw new Error("API key still not configured");

  const mergedModelConfig = {
    ...config.model,
    apiKey,
    provider: (settings.modelProvider as typeof config.model.provider) || config.model.provider,
    modelName: settings.modelName || config.model.modelName,
    baseUrl: settings.modelBaseUrl || config.model.baseUrl,
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
      )
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
  });

  setDirector(director);
  setSettingsContainer(container);
}

export async function bootstrap() {
  const config = loadConfig();
  const fileSystem = new NodeFileSystemAdapter();
  configureIdGenerator(new NodeIdGeneratorAdapter());
  configureContextStorage(new NodeContextStorageAdapter());

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

  // Register knowledge tools
  const wikiTool = new WikiPageTool(config.knowledge.wikiPath, fileSystem);
  const grepTool = new GrepSearchTool(config.knowledge.wikiPath, fileSystem);
  const kgTool = new KnowledgeGraphTool(
    config.knowledge.graphPath || "./knowledge/wiki/graph.json",
    fileSystem
  );
  const tavilyTool = new TavilySearchTool();

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

  // Configure sub-agent descriptors (tool names and prompts from composition root)
  const subAgentToolNames = [
    "wiki_lookup", "wiki_read", "wiki_list",
    "grep_search",
    "kg_query_node", "kg_query_neighbors", "kg_list_nodes",
    "tavily_search", "tavily_extract",
  ];
  configureSubAgentDescriptors(subAgentPrompts, subAgentToolNames);

  // Initialize O11y reporters
  const hooks: import("../port/hook/AgentHook.js").AgentHook[] = [
    new LoggingHook(),
    new ValidationHook(),
    new IterationBudgetHook(10),
    new OutputEnforcementHook(),
    new ContextManagementHook(0.7, 128000),
  ];

  if (config.o11y.enabled) {
    const baseUrl = config.o11y.baseUrl;
    const httpSpanReporter = new HttpSpanReporter(baseUrl);
    const httpLogReporter = new HttpLogReporter(baseUrl);
    const batchSpanReporter = new BatchSpanReporter(httpSpanReporter, config.o11y.flushIntervalMs, config.o11y.batchSize);
    const batchLogReporter = new BatchLogReporter(httpLogReporter, config.o11y.flushIntervalMs, config.o11y.batchSize);
    batchSpanReporter.start();
    batchLogReporter.start();

    setTraceReporter(new HttpTraceReporter(baseUrl));
    setSpanReporter(batchSpanReporter);
    setRuntimeBridgeReporter(new HttpRuntimeStatusReporter(baseUrl));
    hooks.push(new O11yReportingHook(100));
  } else {
    setTraceReporter(new NoOpTraceReporter());
    setSpanReporter(new NoOpSpanReporter());
    setRuntimeBridgeReporter(new NoOpRuntimeStatusReporter());
  }

  // Store bootstrap state for potential late director initialization
  bootstrapState = { config, toolRegistry, skillRegistry, settingsManager, container: null, tavilyTool, directorPrompts, hooks };

  const sessionManager = new SessionManager(fileSystem);
  await sessionManager.initialize();

  const hitlManager = new HITLManager(fileSystem);
  await hitlManager.initialize();

  setConsoleSessionManager(sessionManager);
  setConsoleHITLManager(hitlManager);
  setSessionManager(sessionManager);
  setHITLManager(hitlManager);
  setSettingsManager(settingsManager);
  setTavilyTool(tavilyTool);

  // If API key is available, initialize director immediately
  if (apiKey) {
    const mergedModelConfig = {
      ...config.model,
      apiKey,
      provider: (settings.modelProvider as typeof config.model.provider) || config.model.provider,
      modelName: settings.modelName || config.model.modelName,
      baseUrl: settings.modelBaseUrl || config.model.baseUrl,
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
        )
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
    });

    setDirector(director);
    setSettingsContainer(container);
  } else {
    console.warn("[Bootstrap] No API key configured. Director not initialized. Configure via /api/settings.");
  }

  const app = createApp();
  return { app, config, container: bootstrapState.container, director: null, sessionManager, hitlManager, settingsManager };
}
