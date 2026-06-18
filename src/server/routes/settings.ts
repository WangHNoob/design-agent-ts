import { Hono } from "hono";
import type { SettingsManager } from "../../core/settings/SettingsManager.js";
import type { Container } from "../Container.js";
import type { TavilySearchTool } from "../../adapter/tavily/TavilySearchTool.js";
import { syncEnvFromSettings } from "../envSync.js";
import { isDirectorReady, lateBootstrapDirector } from "../bootstrap.js";
import { hasActiveExecutions } from "./console.js";

let settingsManagerInstance: SettingsManager | null = null;
let containerInstance: Container | null = null;
let tavilyToolInstance: TavilySearchTool | null = null;

let mcpStatusInstance: MCPStatus | null = null;

export interface MCPStatus {
  enabled: boolean;
  servers: Array<{
    name: string;
    transport: string;
    enabled: boolean;
  }>;
  toolNames: string[];
  toolCount: number;
}

export function setMCPStatus(status: MCPStatus) {
  mcpStatusInstance = status;
}

export function setSettingsManager(sm: SettingsManager) {
  settingsManagerInstance = sm;
}

export function setSettingsContainer(container: Container) {
  containerInstance = container;
}

export function setTavilyTool(tool: TavilySearchTool) {
  tavilyToolInstance = tool;
}

export const settingsRoute = new Hono();

settingsRoute.get("/", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }
  return c.json(settingsManagerInstance.getPublicSettings());
});

settingsRoute.get("/status", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }
  const settings = settingsManagerInstance.getSettings();
  const hasApiKey = !!(settings.modelApiKey);
  const hasTavilyKey = !!(settings.tavilyApiKey);
  return c.json({
    configured: hasApiKey && isDirectorReady(),
    needsApiKey: !hasApiKey,
    needsTavilyKey: !hasTavilyKey,
  });
});

settingsRoute.post("/", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }

  // Session lock: prevent config changes while tasks are running
  if (hasActiveExecutions()) {
    return c.json(
      { success: false, error: "无法在任务执行中修改配置，请等待当前任务完成后再试" },
      409
    );
  }

  const body = await c.req.json<Partial<import("../../core/settings/SettingsManager.js").AppSettings>>();
  settingsManagerInstance.updateSettings(body);
  await settingsManagerInstance.save();

  // Sync .env file so changes survive restarts
  syncEnvFromSettings(body);

  // If director is not yet initialized and we now have an API key, late-bootstrap it
  if (!isDirectorReady() && body.modelApiKey) {
    try {
      await lateBootstrapDirector();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ success: false, error: `Failed to initialize: ${msg}` }, 500);
    }
  }

  // Reconfigure LLM in real-time if model config changed and director is ready
  const modelFieldsChanged =
    body.modelProvider !== undefined ||
    body.modelName !== undefined ||
    body.modelApiKey !== undefined ||
    body.modelBaseUrl !== undefined ||
    body.temperature !== undefined ||
    body.maxTokens !== undefined;

  if (isDirectorReady() && containerInstance && modelFieldsChanged) {
    const settings = settingsManagerInstance.getSettings();
    containerInstance.reconfigureModel({
      provider: (settings.modelProvider as "openai" | "anthropic" | "openai-compatible") ?? "openai",
      modelName: settings.modelName ?? "gpt-4o",
      apiKey: settings.modelApiKey ?? "",
      baseUrl: settings.modelBaseUrl || undefined,
      maxTokens: settings.maxTokens || undefined,
      temperature: settings.temperature,
    });
  }

  // Reconfigure Tavily in real-time
  if (tavilyToolInstance && (body.tavilyEnabled !== undefined || body.tavilyApiKey !== undefined)) {
    const settings = settingsManagerInstance.getSettings();
    const enabled = settingsManagerInstance.isTavilyEnabled();
    const apiKey = settingsManagerInstance.getTavilyApiKey();
    tavilyToolInstance.setApiKey(enabled ? apiKey ?? null : null);
  }

  return c.json({ success: true, configured: isDirectorReady(), settings: settingsManagerInstance.getPublicSettings() });
});

settingsRoute.get("/mcp/status", async (c) => {
  if (!mcpStatusInstance) {
    return c.json({ error: "MCP status not initialized" }, 503);
  }
  return c.json(mcpStatusInstance);
});
