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
import { listProviderMetas, loadModelSnapshot, type ReasoningOption } from "../../config/modelRegistry.js";
import type { ReasoningConfig, ReasoningMode } from "../../port/model/ModelConfig.js";

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
const BUILTIN_LLM_PROVIDERS = new Set(["openai", "anthropic", "openai-compatible"]);
const REASONING_MODES = new Set<ReasoningMode>(["off", "minimal", "low", "medium", "high"]);

/** 可选 provider = 内置协议 + models.dev 注册表里的全部 provider id。 */
function allowedLlmProviders(): Set<string> {
  return new Set([...BUILTIN_LLM_PROVIDERS, ...listProviderMetas().map((p) => p.id)]);
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

settingsRoute.get("/models", async (c) => {
  const snapshot = loadModelSnapshot();
  const providers = listProviderMetas().map((p) => ({
    id: p.id,
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    models: Object.values(p.models).map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      reasoningOptions: (m.reasoningOptions ?? []) as ReasoningOption[],
      toolCall: m.toolCall ?? false,
      context: m.context,
      output: m.output,
      costIn: m.costIn,
      costOut: m.costOut,
      deprecated: m.deprecated ?? false,
    })),
  }));
  return c.json({
    fetchedAt: snapshot?.fetchedAt ?? null,
    builtinProviders: [...BUILTIN_LLM_PROVIDERS],
    providers,
  });
});

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
    reasoning: cfg.reasoning ?? null,
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
  if (!allowedLlmProviders().has(provider)) return c.json({ error: "不支持的 provider" }, 400);
  if (!modelName) return c.json({ error: "模型名不能为空" }, 400);
  if (!apiKey) return c.json({ error: "API Key 不能为空" }, 400);
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) return c.json({ error: "Base URL 必须是 http(s) 地址" }, 400);
  const reasoningInput = (body as { reasoning?: { mode?: unknown; budgetTokens?: unknown; effort?: unknown } }).reasoning;
  let reasoning: ReasoningConfig | undefined;
  if (reasoningInput && typeof reasoningInput === "object") {
    const mode = String(reasoningInput.mode ?? "off") as ReasoningMode;
    if (!REASONING_MODES.has(mode)) return c.json({ error: "不支持的思考档位" }, 400);
    reasoning = { mode };
    // 精确思考档位（注册表 effort values 原值，如 none/xhigh/max）
    if (reasoningInput.effort !== undefined && reasoningInput.effort !== null && reasoningInput.effort !== "") {
      const effort = String(reasoningInput.effort);
      if (!/^[a-z0-9_-]{1,16}$/i.test(effort)) return c.json({ error: "无效的思考档位值" }, 400);
      reasoning.effort = effort;
    }
    if (reasoningInput.budgetTokens !== undefined && reasoningInput.budgetTokens !== null) {
      const budget = Number(reasoningInput.budgetTokens);
      if (!Number.isFinite(budget) || budget < 1024 || budget > 1_000_000) {
        return c.json({ error: "思考预算必须是 1024~1000000 的数值" }, 400);
      }
      reasoning.budgetTokens = Math.floor(budget);
    }
  }
  await userLlmStore.set(tenant.userId, {
    provider,
    modelName,
    apiKey,
    baseUrl: baseUrl || undefined,
    reasoning,
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
