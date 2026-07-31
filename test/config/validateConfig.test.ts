import { describe, expect, test } from "vitest";
import type { FrameworkConfig } from "../../src/config/FrameworkConfig.js";
import { validateConfig } from "../../src/config/validateConfig.js";

function config(
  overrides: Partial<FrameworkConfig["userSystem"]> = {},
  messageQueueEnabled = true,
): FrameworkConfig {
  return {
    framework: "mock",
    model: {
      provider: "openai",
      modelName: "gpt-4o",
      apiKey: "",
    },
    hitl: {
      enabled: false,
      reviewPoints: {},
      maxRevisionRounds: 3,
      timeout: 300000,
      autoContinueOnTimeout: false,
    },
    knowledge: {
      wikiPath: "./knowledge/wiki",
      graphPath: "./knowledge/wiki",
    },
    webSearch: {
      tavilyEnabled: false,
    },
    longTermMemory: {
      enabled: false,
      defaultNamespace: "global",
      maxContextMemories: 10,
      minImportanceForContext: 0.4,
      autoExtract: true,
      autoPrune: true,
      maxAgeMs: 2592000000,
      pruneBelowImportance: 0.3,
    },
    userSystem: {
      betterAuthSecret: "local-development-secret-32-characters",
      betterAuthBaseUrl: "http://localhost:4527",
      maxConcurrentPerUser: 3,
      postgresUrl: "postgresql://postgres:postgres@localhost:15432/game_designer",
      redisUrl: "redis://localhost:16379/0",
      adminEmailDomains: "",
      dingtalk: { clientId: "", clientSecret: "" },
      allowEmailPassword: true,
      trustedOrigins: "http://localhost:3001",
      ...overrides,
    },
    messageQueue: {
      enabled: messageQueueEnabled,
      consumerGroup: "gd-workers",
      visibilityTimeoutMs: 30000,
      blockMs: 1000,
      maxRetries: 3,
    },
    execution: {
      taskTimeoutMs: 300000,
      pollIntervalMs: 1000,
      eventMaxLength: 10000,
    },
    mcp: {
      enabled: false,
      servers: [],
    },
    enabledToolGroups: [],
    limits: {
      subAgentMaxIterations: 20,
      queryAgentMaxIterations: 20,
      iterationBudgetDefault: 25,
      contextMaxTokens: 200000,
      contextCompressionThreshold: 0.8,
      tavilyMaxResults: 50,
      grepSearchResultLimit: 20,
      webSourceResultLimit: 10,
      sessionListLimit: 500,
      hitlMaxRevisionRounds: 10,
      modelMaxTokens: 65536,
    },
    blackboard: {
      enabled: true,
      defaultTtlSeconds: 300,
      webTtlSeconds: 600,
      recentInjectCount: 5,
      cachedTools: [],
    },
    tracing: {
      enabled: true,
      consoleExporter: false,
    },
  };
}

describe("validateConfig", () => {
  test("accepts an explicit local development configuration", () => {
    expect(() => validateConfig(config(), { port: 4527 })).not.toThrow();
  });

  test("rejects empty BETTER_AUTH_SECRET", () => {
    expect(() =>
      validateConfig(config({
        betterAuthSecret: "",
      }), { port: 4527 }),
    ).toThrow(/BETTER_AUTH_SECRET is required/);
  });

  test("rejects placeholder BETTER_AUTH_SECRET", () => {
    expect(() =>
      validateConfig(config({
        betterAuthSecret: "change-me-in-production-change-me",
      }), { port: 4527 }),
    ).toThrow(/must not be a placeholder/);
  });

  test("requires POSTGRES_URL", () => {
    expect(() =>
      validateConfig(config({
        postgresUrl: "",
      }), { port: 4527 }),
    ).toThrow(/POSTGRES_URL is required/);
  });

  test("rejects invalid POSTGRES_URL", () => {
    expect(() =>
      validateConfig(config({
        postgresUrl: "http://localhost:5432/game_designer",
      }), { port: 4527 }),
    ).toThrow(/POSTGRES_URL must be a valid/);
  });

  test("requires REDIS_URL", () => {
    expect(() =>
      validateConfig(config({
        redisUrl: "",
      }), { port: 4527 }),
    ).toThrow(/REDIS_URL is required/);
  });

  test("rejects invalid REDIS_URL", () => {
    expect(() =>
      validateConfig(config({
        redisUrl: "http://localhost:6379",
      }), { port: 4527 }),
    ).toThrow(/REDIS_URL must be a valid/);
  });

  test("requires the message queue", () => {
    expect(() => validateConfig(config({}, false), { port: 4527 }))
      .toThrow(/MQ_ENABLED must be true/);
  });

  test("rejects stdio MCP server without command", () => {
    const cfg = { ...config(), mcp: { enabled: true, servers: [{ name: "s1", transport: "stdio" as const, enabled: true }] } };
    expect(() => validateConfig(cfg, { port: 4527 })).toThrow(/command is required for stdio transport/);
  });

  test("rejects http MCP server with invalid url", () => {
    const cfg = { ...config(), mcp: { enabled: true, servers: [{ name: "s1", transport: "http" as const, enabled: true, url: "not-a-url" }] } };
    expect(() => validateConfig(cfg, { port: 4527 })).toThrow(/a valid url is required for http transport/);
  });

  test("accepts valid MCP server configs", () => {
    const cfg = {
      ...config(),
      mcp: {
        enabled: true,
        servers: [
          { name: "stdio-srv", transport: "stdio" as const, enabled: true, command: "node", args: ["srv.js"] },
          { name: "http-srv", transport: "http" as const, enabled: true, url: "http://localhost:4174/mcp" },
        ],
      },
    };
    expect(() => validateConfig(cfg, { port: 4527 })).not.toThrow();
  });
});
