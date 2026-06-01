import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SETTINGS_TO_ENV_MAP: Record<string, string> = {
  modelProvider: "LLM_PROVIDER",
  modelName: "LLM_MODEL",
  modelApiKey: "LLM_API_KEY",
  modelBaseUrl: "LLM_BASE_URL",
  tavilyEnabled: "TAVILY_ENABLED",
  tavilyApiKey: "TAVILY_API_KEY",
  hitlEnabled: "HITL_ENABLED",
};

/**
 * 将用户设置同步回写 .env 文件，保持环境变量与运行时配置一致。
 * 保留原有注释和空行，仅更新发生变化的键。
 */
export function syncEnvFromSettings(updates: Record<string, unknown>): void {
  const envPath = ".env";
  const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = envContent.split(/\r?\n/);

  const envUpdates: Record<string, string | undefined> = {};
  for (const [settingKey, envKey] of Object.entries(SETTINGS_TO_ENV_MAP)) {
    if (settingKey in updates) {
      const value = updates[settingKey];
      if (value === undefined || value === null) {
        envUpdates[envKey] = undefined;
      } else if (typeof value === "boolean") {
        envUpdates[envKey] = value ? "true" : "false";
      } else {
        envUpdates[envKey] = String(value);
      }
    }
  }

  if (Object.keys(envUpdates).length === 0) return;

  const updatedKeys = new Set<string>();
  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && match[1]) {
      const key = match[1];
      if (key in envUpdates) {
        updatedKeys.add(key);
        const newValue = envUpdates[key];
        if (newValue === undefined) {
          return `# ${line}`;
        }
        return `${key}=${newValue}`;
      }
    }
    return line;
  });

  for (const key of Object.keys(envUpdates)) {
    const value = envUpdates[key];
    if (!updatedKeys.has(key) && value !== undefined) {
      newLines.push(`${key}=${value}`);
    }
  }

  const output = newLines.join("\n");
  writeFileSync(envPath, output.endsWith("\n") ? output : output + "\n");
}
