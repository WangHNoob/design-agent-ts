import { describe, expect, test } from "vitest";
import type { FrameworkConfig } from "../../src/config/FrameworkConfig.js";
import { validateConfig } from "../../src/config/validateConfig.js";

function config(overrides: Partial<FrameworkConfig["userSystem"]> = {}): FrameworkConfig {
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
      storagePath: "./data/long-term-memory",
      defaultNamespace: "global",
      maxContextMemories: 10,
      minImportanceForContext: 0.4,
      autoExtract: true,
      autoPrune: true,
      maxAgeMs: 2592000000,
      pruneBelowImportance: 0.3,
    },
    userSystem: {
      enabled: false,
      betterAuthSecret: "change-me-in-production",
      betterAuthBaseUrl: "http://localhost:4527",
      maxConcurrentPerUser: 3,
      postgresUrl: "",
      redisUrl: "",
      autoInitSchema: true,
      ...overrides,
    },
    messageQueue: {
      enabled: false,
      consumerGroup: "gd-workers",
      pollIntervalMs: 100,
    },
    mcp: {
      enabled: false,
      servers: [],
    },
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
  };
}

describe("validateConfig", () => {
  test("allows default local mode when user system is disabled", () => {
    expect(() => validateConfig(config(), { port: 4527 })).not.toThrow();
  });

  test("rejects unsafe Better Auth defaults when user system is enabled", () => {
    expect(() =>
      validateConfig(config({
        enabled: true,
        postgresUrl: "postgresql://postgres:postgres@localhost:15432/game_designer",
        redisUrl: "redis://localhost:16379/0",
      }), { port: 4527 }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  test("requires Postgres and Redis URLs when user system is enabled", () => {
    expect(() =>
      validateConfig(config({
        enabled: true,
        betterAuthSecret: "local-secret-at-least-32-characters",
        postgresUrl: "",
        redisUrl: "",
      }), { port: 4527 }),
    ).toThrow(/POSTGRES_URL.*REDIS_URL/s);
  });

  test("rejects localhost Better Auth base URL with a mismatched port", () => {
    expect(() =>
      validateConfig(config({
        enabled: true,
        betterAuthSecret: "local-secret-at-least-32-characters",
        betterAuthBaseUrl: "http://localhost:3000",
        postgresUrl: "postgresql://postgres:postgres@localhost:15432/game_designer",
        redisUrl: "redis://localhost:16379/0",
      }), { port: 4527 }),
    ).toThrow(/BETTER_AUTH_BASE_URL/);
  });

  test("accepts valid user system configuration", () => {
    expect(() =>
      validateConfig(config({
        enabled: true,
        betterAuthSecret: "local-secret-at-least-32-characters",
        postgresUrl: "postgresql://postgres:postgres@localhost:15432/game_designer",
        redisUrl: "redis://localhost:16379/0",
      }), { port: 4527 }),
    ).not.toThrow();
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
