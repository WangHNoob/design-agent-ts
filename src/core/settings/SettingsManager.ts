import type { FileSystemPort } from "../../port/fs/FileSystemPort.js";

export interface AppSettings {
  modelProvider?: string;
  modelName?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  hitlEnabled?: boolean;
  maxClarifyRounds?: number;
  streamingEnabled?: boolean;
  autoSaveSessions?: boolean;
  tavilyEnabled?: boolean;
  tavilyApiKey?: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  modelProvider: "openai",
  modelName: "gpt-4o",
  modelApiKey: "",
  modelBaseUrl: "",
  temperature: 0.7,
  maxTokens: 4096,
  hitlEnabled: false,
  maxClarifyRounds: 3,
  streamingEnabled: true,
  autoSaveSessions: true,
  tavilyEnabled: false,
  tavilyApiKey: "",
};

export class SettingsManager {
  private settingsFile: string;
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private initialized = false;

  constructor(
    private fs: FileSystemPort,
    private baseDir = ".",
  ) {
    this.settingsFile = this.fs.join(baseDir, "settings.json");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const content = await this.fs.readFile(this.settingsFile);
      if (content) {
        const parsed = JSON.parse(content) as AppSettings;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        this.settings = { ...DEFAULT_SETTINGS };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    this.initialized = true;
  }

  async save(): Promise<void> {
    await this.fs.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2));
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getPublicSettings(): Omit<AppSettings, "tavilyApiKey" | "modelApiKey"> & { tavilyApiKeyPreview?: string; modelApiKeyPreview?: string } {
    const s = { ...this.settings };
    const tavilyPreview = s.tavilyApiKey
      ? s.tavilyApiKey.substring(0, Math.min(8, s.tavilyApiKey.length)) + "..."
      : "";
    const modelPreview = s.modelApiKey
      ? s.modelApiKey.substring(0, Math.min(8, s.modelApiKey.length)) + "..."
      : "";
    delete (s as AppSettings & { tavilyApiKey?: string }).tavilyApiKey;
    delete (s as AppSettings & { modelApiKey?: string }).modelApiKey;
    return { ...s, tavilyApiKeyPreview: tavilyPreview, modelApiKeyPreview: modelPreview };
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...updates };
  }

  getTavilyApiKey(): string | undefined {
    return this.settings.tavilyApiKey;
  }

  isTavilyEnabled(): boolean {
    return !!this.settings.tavilyEnabled && !!this.settings.tavilyApiKey;
  }

  getTavilyStatus(): { connected: boolean; enabled: boolean; apiKeySet: boolean; preview: string } {
    const apiKey = this.settings.tavilyApiKey ?? "";
    return {
      connected: !!this.settings.tavilyEnabled && apiKey.length > 0,
      enabled: !!this.settings.tavilyEnabled,
      apiKeySet: apiKey.length > 0,
      preview: apiKey ? apiKey.substring(0, Math.min(8, apiKey.length)) + "..." : "",
    };
  }
}
