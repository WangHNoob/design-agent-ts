import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/loadConfig.js";

/**
 * HITL 内容审阅点配置解析（HITL_REVIEW_POINTS 按点粒度）。
 * 产品决策（2026-10-11）：内容审阅默认全关；HITL 价值在有副作用的危险操作，
 * 走独立的 hitl-tool-irreversible 审批链路（SECURITY_IRREVERSIBLE_REQUIRE_HITL），
 * 不受 HITL_ENABLED 影响。
 */

const KEYS = ["HITL_ENABLED", "HITL_REVIEW_POINTS"] as const;
const ORIGINAL: Record<string, string | undefined> = {};
for (const key of KEYS) ORIGINAL[key] = process.env[key];

// loadConfig 校验必需项（与 loadConfig.faq.test.ts 同一套 stub）
const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: "local-development-secret-32-characters",
  POSTGRES_URL: "postgresql://postgres:postgres@localhost:15432/game_designer",
  REDIS_URL: "redis://localhost:16379/0",
  MQ_ENABLED: "true",
};
const BASE_ORIGINAL: Record<string, string | undefined> = {};
for (const key of Object.keys(BASE_ENV)) BASE_ORIGINAL[key] = process.env[key];

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  Object.assign(process.env, BASE_ENV);
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const [key, value] of Object.entries(BASE_ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("loadConfig HITL_REVIEW_POINTS", () => {
  it("总闸关闭：reviewPoints 恒空（点名也不生效）", () => {
    withEnv({ HITL_ENABLED: "false", HITL_REVIEW_POINTS: "hitl-3-final" });
    const config = loadConfig();
    expect(config.hitl.enabled).toBe(false);
    expect(config.hitl.reviewPoints).toEqual({});
  });

  it("总闸开启 + 未点名：内容审阅默认全关（新默认，非三点全开）", () => {
    withEnv({ HITL_ENABLED: "true" });
    const config = loadConfig();
    expect(config.hitl.enabled).toBe(true);
    expect(config.hitl.reviewPoints).toEqual({});
  });

  it("总闸开启 + 点名：只有点名的审阅点开启", () => {
    withEnv({ HITL_ENABLED: "true", HITL_REVIEW_POINTS: "hitl-3-final" });
    const config = loadConfig();
    expect(config.hitl.reviewPoints).toEqual({ "hitl-3-final": true });
  });

  it("多点逗号分隔 + 空白容错", () => {
    withEnv({
      HITL_ENABLED: "true",
      HITL_REVIEW_POINTS: " hitl-1-task-plan , hitl-2-agent-output ,, ",
    });
    const config = loadConfig();
    expect(config.hitl.reviewPoints).toEqual({
      "hitl-1-task-plan": true,
      "hitl-2-agent-output": true,
    });
  });
});
