import { Hono } from "hono";
import type { SettingsManager } from "../../core/settings/SettingsManager.js";
import type { Container } from "../Container.js";

let settingsManagerInstance: SettingsManager | null = null;
let containerInstance: Container | null = null;

export function setSettingsManager(sm: SettingsManager) {
  settingsManagerInstance = sm;
}

export function setSettingsContainer(container: Container) {
  containerInstance = container;
}

export const settingsRoute = new Hono();

settingsRoute.get("/", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }
  return c.json(settingsManagerInstance.getPublicSettings());
});

settingsRoute.post("/", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }

  const body = await c.req.json<Partial<import("../../core/settings/SettingsManager.js").AppSettings>>();
  settingsManagerInstance.updateSettings(body);
  await settingsManagerInstance.save();

  // Reconfigure LLM in real-time if model config changed
  if (
    containerInstance &&
    (body.modelProvider !== undefined ||
      body.modelName !== undefined ||
      body.modelApiKey !== undefined ||
      body.modelBaseUrl !== undefined)
  ) {
    const settings = settingsManagerInstance.getSettings();
    containerInstance.reconfigureModel({
      provider: (settings.modelProvider as "openai" | "anthropic" | "openai-compatible") ?? "openai",
      modelName: settings.modelName ?? "gpt-4o",
      apiKey: settings.modelApiKey ?? "",
      baseUrl: settings.modelBaseUrl || undefined,
    });
  }

  return c.json({ success: true, settings: settingsManagerInstance.getPublicSettings() });
});

settingsRoute.get("/mcp/status", async (c) => {
  if (!settingsManagerInstance) {
    return c.json({ error: "SettingsManager not initialized" }, 503);
  }
  return c.json(settingsManagerInstance.getTavilyStatus());
});
