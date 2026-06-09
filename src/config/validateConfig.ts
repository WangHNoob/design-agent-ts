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

export function validateConfig(config: FrameworkConfig, options: ConfigValidationOptions = {}): void {
  const issues: string[] = [];

  if (config.userSystem.enabled) {
    if (
      isBlank(config.userSystem.betterAuthSecret) ||
      config.userSystem.betterAuthSecret === "change-me-in-production"
    ) {
      issues.push("BETTER_AUTH_SECRET must be set to a non-default value when USER_SYSTEM_ENABLED=true.");
    }

    if (isBlank(config.userSystem.postgresUrl)) {
      issues.push("POSTGRES_URL is required when USER_SYSTEM_ENABLED=true.");
    }

    if (isBlank(config.userSystem.redisUrl)) {
      issues.push("REDIS_URL is required when USER_SYSTEM_ENABLED=true.");
    }

    const baseUrl = parseUrl(config.userSystem.betterAuthBaseUrl);
    if (!baseUrl) {
      issues.push("BETTER_AUTH_BASE_URL must be a valid absolute URL when USER_SYSTEM_ENABLED=true.");
    } else if (
      options.port &&
      (baseUrl.hostname === "localhost" || baseUrl.hostname === "127.0.0.1") &&
      Number(baseUrl.port || (baseUrl.protocol === "https:" ? 443 : 80)) !== options.port
    ) {
      issues.push(`BETTER_AUTH_BASE_URL must use localhost port ${options.port} when USER_SYSTEM_ENABLED=true.`);
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}
