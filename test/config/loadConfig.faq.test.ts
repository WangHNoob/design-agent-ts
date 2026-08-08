import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadConfig } from "../../src/config/loadConfig.js";

const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: "local-development-secret-32-characters",
  POSTGRES_URL: "postgresql://postgres:postgres@localhost:15432/game_designer",
  REDIS_URL: "redis://localhost:16379/0",
  MQ_ENABLED: "true",
};

const FAQ_ENV_KEYS = ["FAQ_ENABLED", "FAQ_THRESHOLD", "FAQ_TIMEOUT_MS", "FAQ_TOOL_NAME"] as const;

function stubBaseEnv(): void {
  for (const [key, value] of Object.entries(BASE_ENV)) {
    vi.stubEnv(key, value);
  }
  for (const key of FAQ_ENV_KEYS) {
    delete process.env[key];
  }
}

describe("loadConfig FAQ settings", () => {
  beforeEach(() => {
    stubBaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("defaults when FAQ_* env vars are unset", () => {
    const config = loadConfig();
    expect(config.faq).toEqual({
      faqEnabled: false,
      faqThreshold: 0.82,
      faqTimeoutMs: 800,
      faqToolName: "kb_faq_match",
    });
  });

  test("reads FAQ_* overrides from environment", () => {
    vi.stubEnv("FAQ_ENABLED", "true");
    vi.stubEnv("FAQ_THRESHOLD", "0.91");
    vi.stubEnv("FAQ_TIMEOUT_MS", "1500");
    vi.stubEnv("FAQ_TOOL_NAME", "custom_faq_tool");

    const config = loadConfig();
    expect(config.faq).toEqual({
      faqEnabled: true,
      faqThreshold: 0.91,
      faqTimeoutMs: 1500,
      faqToolName: "custom_faq_tool",
    });
  });
});
