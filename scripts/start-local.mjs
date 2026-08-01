#!/usr/bin/env node
/**
 * start-local.mjs — 本地完整开发环境启动脚本
 *
 * 一次性启动：
 *   1. Knowledge Hub（MCP 知识库服务器，端口 4174）
 *   2. Game Designer 后端（Hono 服务器，端口 4527）
 *   3. Game Designer 前端（Vite dev server，端口 3001）
 *
 * 前提：PostgreSQL 和 Redis 已在本地运行（均为强制依赖）
 *       且已应用 drizzle 迁移、配置 BETTER_AUTH_SECRET 与 MQ_ENABLED=true
 *
 * 使用：
 *   node scripts/start-local.mjs
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KH_DIR = resolve(ROOT, "..", "knowledge-hub");

const COLORS = {
  kh: "\x1b[35m", // magenta
  backend: "\x1b[36m", // cyan
  frontend: "\x1b[33m", // yellow
  system: "\x1b[32m", // green
  reset: "\x1b[0m",
};

function log(tag, msg) {
  const color = COLORS[tag] ?? COLORS.system;
  console.log(`${color}[${tag}]${COLORS.reset} ${msg}`);
}

function spawnProcess(tag, command, args, opts = {}) {
  log(tag, `starting: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, {
    stdio: "pipe",
    shell: true,
    ...opts,
  });
  child.stdout.on("data", (data) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(tag, line);
    }
  });
  child.stderr.on("data", (data) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(tag, line);
    }
  });
  child.on("exit", (code) => {
    log(tag, `exited with code ${code}`);
  });
  return child;
}

async function checkPort(port) {
  try {
    const r = await fetch(`http://localhost:${port}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   Game Designer TS — 本地开发环境启动        ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // 1. Knowledge Hub
  const khRunning = await checkPort(4174);
  if (khRunning) {
    log("system", "Knowledge Hub 已在 http://localhost:4174 运行 ✓");
  } else {
    log("system", "启动 Knowledge Hub...");
    spawnProcess("kh", "npx", ["tsx", "src/server/index.ts"], {
      cwd: KH_DIR,
      env: { ...process.env, PORT: "4174" },
    });
    // wait for it
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await checkPort(4174)) {
        log("system", "Knowledge Hub 已就绪 ✓");
        break;
      }
    }
  }

  // 2. Game Designer Backend + Frontend
  log("system", "启动 Game Designer (backend + frontend)...");
  // Fix: shell may have stale env vars from Docker runs.
  // Explicitly set the correct ones so --env-file values take effect.
  const localPgUrl = "postgresql://postgres:whbwhb2026@localhost:5433/game_designer";
  const mcpServers = JSON.stringify([{
    name: "knowledge-hub",
    transport: "stdio",
    enabled: true,
    command: "npx",
    args: ["tsx", resolve(KH_DIR, "src/server/mcpStdio.ts")],
    env: {
      DATABASE_URL: process.env.KH_DATABASE_URL || "postgres://postgres:khpw@127.0.0.1:5432/knowledge_hub",
      KH_JWT_SECRET: process.env.KH_JWT_SECRET || "dev-secret-change-me",
      KH_DATA_DIR: resolve(KH_DIR, "data"),
    },
  }]);
  spawnProcess("all", "npx", ["concurrently", "-n", "backend,frontend", "-c", "cyan,magenta", "npm run dev", "npm run dev:web"], {
    cwd: ROOT,
    env: {
      ...process.env,
      POSTGRES_URL: localPgUrl,
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "whbwhb2026",
      POSTGRES_DB: "game_designer",
      POSTGRES_PORT: "5433",
      MCP_ENABLED: "true",
      MCP_SERVERS: mcpServers,
      MCP_PROJECT_ID: process.env.MCP_PROJECT_ID || "default_project",
      MCP_DISABLE_LOCAL_KNOWLEDGE_WHEN_HEALTHY: process.env.MCP_DISABLE_LOCAL_KNOWLEDGE_WHEN_HEALTHY || "true",
    },
  });

  log("system", "等待服务就绪...");
  log("system", "");
  log("system", "  Knowledge Hub:  http://localhost:4174");
  log("system", "  Backend API:    http://localhost:4527");
  log("system", "  Frontend:       http://localhost:3001");
  log("system", "");
  log("system", "按 Ctrl+C 停止所有服务");
}

process.on("SIGINT", () => {
  log("system", "正在关闭...");
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
