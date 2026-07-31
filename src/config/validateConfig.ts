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
  if (
    !Number.isInteger(config.messageQueue.visibilityTimeoutMs) ||
    config.messageQueue.visibilityTimeoutMs <= 0
  ) {
    issues.push("MQ_VISIBILITY_TIMEOUT_MS must be a positive integer.");
  }
  if (
    !Number.isInteger(config.messageQueue.blockMs) ||
    config.messageQueue.blockMs <= 0 ||
    config.messageQueue.blockMs > 2000
  ) {
    issues.push("MQ_BLOCK_MS must be an integer between 1 and 2000.");
  }
  if (!Number.isInteger(config.messageQueue.maxRetries) || config.messageQueue.maxRetries < 0) {
    issues.push("MQ_MAX_RETRIES must be a non-negative integer.");
  }
  if (!Number.isInteger(config.execution.taskTimeoutMs) || config.execution.taskTimeoutMs <= 0) {
    issues.push("EXECUTION_TASK_TIMEOUT_MS must be a positive integer.");
  }
  if (
    !Number.isInteger(config.execution.pollIntervalMs)
    || config.execution.pollIntervalMs < 500
    || config.execution.pollIntervalMs > 2000
  ) {
    issues.push("EXECUTION_POLL_INTERVAL_MS must be an integer between 500 and 2000.");
  }
  if (!Number.isInteger(config.execution.eventMaxLength) || config.execution.eventMaxLength <= 0) {
    issues.push("EXECUTION_EVENT_MAX_LENGTH must be a positive integer.");
  }
  if (
    !Number.isFinite(config.execution.sseHeartbeatMs)
    || Number.isNaN(config.execution.sseHeartbeatMs)
    || config.execution.sseHeartbeatMs < 0
  ) {
    issues.push("SSE_HEARTBEAT_MS must be a non-negative number (0 disables heartbeat).");
  }
  if (
    !Number.isInteger(config.memory.protectRecentTurns)
    || config.memory.protectRecentTurns < 1
  ) {
    issues.push("MEMORY_PROTECT_RECENT_TURNS must be an integer >= 1 (recent non-system message count).");
  }
  if (
    !Number.isInteger(config.memory.maxActiveMessages)
    || config.memory.maxActiveMessages < config.memory.protectRecentTurns
  ) {
    issues.push(
      "MEMORY_MAX_ACTIVE_MESSAGES must be an integer >= MEMORY_PROTECT_RECENT_TURNS.",
    );
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
