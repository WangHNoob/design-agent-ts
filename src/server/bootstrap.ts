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
import { loadPrompt } from "../config/PromptLoader.js";
import { SettingsManager } from "../core/settings/SettingsManager.js";
import { setSettingsManager, setSettingsContainer, setTavilyTool } from "./routes/settings.js";
import { NodeFileSystemAdapter } from "../adapter/fs/NodeFileSystemAdapter.js";

export async function bootstrap() {
  const config = loadConfig();
  const fileSystem = new NodeFileSystemAdapter();

  // API key can come from env or settings.json; don't throw here, check after loading settings
  let apiKey = config.model.apiKey;

  // Load user settings from settings.json (overrides env defaults)
  const settingsManager = new SettingsManager(fileSystem);
  await settingsManager.initialize();

  // Apply model settings from settings.json if available
  const settings = settingsManager.getSettings();
  if (settings.modelApiKey) {
    apiKey = settings.modelApiKey;
  }
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set. Please configure it in settings or environment variables.");
  }
  // Override config.model with settings.json values
  const mergedModelConfig = {
    ...config.model,
    apiKey,
    provider: (settings.modelProvider as typeof config.model.provider) || config.model.provider,
    modelName: settings.modelName || config.model.modelName,
    baseUrl: settings.modelBaseUrl || config.model.baseUrl,
  };

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
  const wikiTool = new WikiPageTool(config.knowledge.wikiPath);
  const grepTool = new GrepSearchTool(config.knowledge.wikiPath);
  const kgTool = new KnowledgeGraphTool(
    config.knowledge.graphPath || "./knowledge/wiki/graph.json"
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

  const container = new Container({ ...config, model: mergedModelConfig }, toolRegistry, skillRegistry);

  // Configure HITL review points
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

  // Initialize O11y reporters
  const hooks: import("../port/hook/AgentHook.js").AgentHook[] = [
    new LoggingHook(),
    new ValidationHook(),
    new IterationBudgetHook(),
    new OutputEnforcementHook(),
    new ContextManagementHook(),
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
    hooks.push(new O11yReportingHook());
  } else {
    setTraceReporter(new NoOpTraceReporter());
    setSpanReporter(new NoOpSpanReporter());
    setRuntimeBridgeReporter(new NoOpRuntimeStatusReporter());
  }

  const director = new DirectorAgent({
    model: container.model,
    agentFactory: container.agentFactory,
    toolRegistry,
    skillRegistry,
    humanReviewGateway: container.humanReviewGateway,
    hooks,
    prompts: directorPrompts,
  });

  const sessionManager = new SessionManager();
  await sessionManager.initialize();

  const hitlManager = new HITLManager();
  await hitlManager.initialize();

  setDirector(director);
  setConsoleSessionManager(sessionManager);
  setConsoleHITLManager(hitlManager);
  setSessionManager(sessionManager);
  setHITLManager(hitlManager);
  setSettingsManager(settingsManager);
  setSettingsContainer(container);
  setTavilyTool(tavilyTool);

  const app = createApp();
  return { app, config, container, director, sessionManager, hitlManager, settingsManager };
}
