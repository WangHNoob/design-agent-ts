import { Hono } from "hono";
import type { SettingsManager } from "../../core/settings/SettingsManager.js";
import type { Container } from "../Container.js";
import type { TavilySearchTool } from "../../adapter/tavily/TavilySearchTool.js";
import { syncEnvFromSettings } from "../envSync.js";
import { isDirectorReady, lateBootstrapDirector } from "../bootstrap.js";
import { hasActiveExecutions } from "./console.js";
import { requireAdmin } from "../middleware/auth.js";
import { redactSensitiveSettings } from "../../core/audit/redact.js";
import { appendAudit } from "../security/auditHelpers.js";
import type { TenantContext } from "../../port/user/TenantIsolationPort.js";
import { UserLlmSettingsStore, type UserLlmConfig } from "../UserLlmSettingsStore.js";

let userLlmStore: UserLlmSettingsStore | null = null;
export function setUserLlmSettingsStore(store: UserLlmSettingsStore): void {
  userLlmStore = store;
}

let settingsManagerInstance: SettingsManager | null = null;
let containerInstance: Container | null = null;
let tavilyToolInstance: TavilySearchTool | null = null;

let mcpStatusInstance: MCPStatus | null = null;

export interface MCPToolInfo {
  name: string;
  description: string;
  serverName: string;
  parameters: Record<string, unknown>;
}

export interface MCPStatus {
  enabled: boolean;
  servers: Array<{
    name: string;
    transport: string;
    enabled: boolean;
  }>;
  toolNames: string[];
  toolCount: number;
  tools: MCPToolInfo[];
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

settingsRoute.post("/", requireAdmin(), async (c) => {
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
    const enabled = settingsManagerInstance.isTavilyEnabled();
    const apiKey = settingsManagerInstance.getTavilyApiKey();
    tavilyToolInstance.setApiKey(enabled ? apiKey ?? null : null);
  }

  const tenant = c.get("tenant") as TenantContext | undefined;
  if (tenant) {
    await appendAudit({
      userId: tenant.userId,
      action: "config.change",
      resourceType: "settings",
      resourceId: "app_settings",
      sessionId: tenant.sessionId,
      outcome: "success",
      detail: { changes: redactSensitiveSettings(body as Record<string, unknown>) },
    });
  }

  return c.json({ success: true, configured: isDirectorReady(), settings: settingsManagerInstance.getPublicSettings() });
});

settingsRoute.get("/mcp/status", async (c) => {
  if (!mcpStatusInstance) {
    return c.json({ error: "MCP status not initialized" }, 503);
  }
  return c.json(mcpStatusInstance);
});

settingsRoute.get("/mcp/tools", async (c) => {
  if (!mcpStatusInstance) {
    return c.json({ error: "MCP status not initialized" }, 503);
  }
  return c.json({
    tools: mcpStatusInstance.tools,
    total: mcpStatusInstance.toolCount,
  });
});

settingsRoute.get("/mcp/servers", async (c) => {
  if (!mcpStatusInstance) {
    return c.json({ error: "MCP status not initialized" }, 503);
  }
  return c.json({
    servers: mcpStatusInstance.servers,
    enabled: mcpStatusInstance.enabled,
  });
});

// ── 访客 BYOK：按用户模型配置（体验后应删除 Key）──
const LLM_PROVIDERS = new Set(["openai", "anthropic", "openai-compatible"]);

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

settingsRoute.get("/llm", async (c) => {
  if (!userLlmStore) return c.json({ error: "not initialized" }, 503);
  const tenant = c.get("tenant") as TenantContext | undefined;
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const cfg = await userLlmStore.get(tenant.userId);
  if (!cfg) return c.json({ configured: false });
  return c.json({
    configured: true,
    provider: cfg.provider,
    modelName: cfg.modelName,
    baseUrl: cfg.baseUrl ?? "",
    apiKeyMasked: maskKey(cfg.apiKey),
    updatedAt: cfg.updatedAt,
  });
});

settingsRoute.put("/llm", async (c) => {
  if (!userLlmStore) return c.json({ error: "not initialized" }, 503);
  const tenant = c.get("tenant") as TenantContext | undefined;
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<Partial<UserLlmConfig>>();
  const provider = String(body.provider ?? "openai-compatible");
  const modelName = String(body.modelName ?? "").trim();
  const apiKey = String(body.apiKey ?? "").trim();
  const baseUrl = String(body.baseUrl ?? "").trim();
  if (!LLM_PROVIDERS.has(provider)) return c.json({ error: "不支持的 provider" }, 400);
  if (!modelName) return c.json({ error: "模型名不能为空" }, 400);
  if (!apiKey) return c.json({ error: "API Key 不能为空" }, 400);
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) return c.json({ error: "Base URL 必须是 http(s) 地址" }, 400);
  await userLlmStore.set(tenant.userId, {
    provider: provider as UserLlmConfig["provider"],
    modelName,
    apiKey,
    baseUrl: baseUrl || undefined,
  });
  await appendAudit({
    userId: tenant.userId,
    action: "config.change",
    resourceType: "user_llm_settings",
    resourceId: tenant.userId,
    sessionId: tenant.sessionId,
    outcome: "success",
    detail: { provider, modelName, apiKeyMasked: maskKey(apiKey) },
  });
  return c.json({ success: true, apiKeyMasked: maskKey(apiKey) });
});

settingsRoute.delete("/llm", async (c) => {
  if (!userLlmStore) return c.json({ error: "not initialized" }, 503);
  const tenant = c.get("tenant") as TenantContext | undefined;
  if (!tenant) return c.json({ error: "Unauthorized" }, 401);
  const existed = await userLlmStore.get(tenant.userId);
  await userLlmStore.remove(tenant.userId);
  if (existed) {
    await appendAudit({
      userId: tenant.userId,
      action: "config.change",
      resourceType: "user_llm_settings",
      resourceId: tenant.userId,
      sessionId: tenant.sessionId,
      outcome: "success",
      detail: { deleted: true },
    });
  }
  return c.json({ success: true, configured: false });
});
