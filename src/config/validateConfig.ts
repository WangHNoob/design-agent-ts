import type { FrameworkConfig } from "./FrameworkConfig.js";

export interface ConfigValidationOptions {
  readonly port?: number;
}

export class ConfigValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("change-me") ||
    normalized.includes("replace-me") ||
    normalized.includes("your-secret") ||
    normalized.includes("<secret>")
  );
}

export function validateConfig(config: FrameworkConfig, options: ConfigValidationOptions = {}): void {
  const issues: string[] = [];

  if (isBlank(config.userSystem.betterAuthSecret)) {
    issues.push("BETTER_AUTH_SECRET is required.");
  } else if (
    config.userSystem.betterAuthSecret.trim().length < 32 ||
    isPlaceholderSecret(config.userSystem.betterAuthSecret)
  ) {
    issues.push("BETTER_AUTH_SECRET must be at least 32 characters and must not be a placeholder.");
  }

  if (isBlank(config.userSystem.postgresUrl)) {
    issues.push("POSTGRES_URL is required.");
  } else {
    const postgresUrl = parseUrl(config.userSystem.postgresUrl);
    if (!postgresUrl || !["postgres:", "postgresql:"].includes(postgresUrl.protocol)) {
      issues.push("POSTGRES_URL must be a valid postgres:// or postgresql:// URL.");
    }
  }

  if (isBlank(config.userSystem.redisUrl)) {
    issues.push("REDIS_URL is required.");
  } else {
    const redisUrl = parseUrl(config.userSystem.redisUrl);
    if (!redisUrl || !["redis:", "rediss:"].includes(redisUrl.protocol)) {
      issues.push("REDIS_URL must be a valid redis:// or rediss:// URL.");
    }
  }

  const baseUrl = parseUrl(config.userSystem.betterAuthBaseUrl);
  if (!baseUrl || !["http:", "https:"].includes(baseUrl.protocol)) {
    issues.push("BETTER_AUTH_BASE_URL must be a valid absolute HTTP(S) URL.");
  }

  if (!config.messageQueue.enabled) {
    issues.push("MQ_ENABLED must be true; the Redis message queue is required.");
  }

  if (config.mcp.enabled) {
    config.mcp.servers.forEach((server, index) => {
      const label = server.name || `#${index}`;
      if (isBlank(server.name)) {
        issues.push(`MCP server ${label}: name is required.`);
      }
      if (server.transport === "stdio") {
        if (isBlank(server.command)) {
          issues.push(`MCP server ${label}: command is required for stdio transport.`);
        }
      } else if (server.transport === "sse" || server.transport === "http") {
        if (isBlank(server.url) || !parseUrl(server.url!)) {
          issues.push(`MCP server ${label}: a valid url is required for ${server.transport} transport.`);
        }
      } else {
        issues.push(`MCP server ${label}: transport must be one of stdio | sse | http.`);
      }
    });
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}
