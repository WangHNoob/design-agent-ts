/**
 * Docker 环境启动脚本 — 支持前置检测与一键启动
 *
 * 用法:
 *   node docker-start.mjs              # 智能检测：PG/Redis 已运行则跳过 infra
 *   node docker-start.mjs --infra      # 强制启动基础设施（PG/Redis/监控）
 *   node docker-start.mjs --app        # 仅启动应用（backend+frontend），不检测 infra
 *   node docker-start.mjs --rebuild    # 本地编译 → 打包进 Docker → 启动
 *   node docker-start.mjs --down       # 停止并移除所有服务
 *   node docker-start.mjs --logs       # 查看所有服务日志
 *
 * --rebuild 流程：
 *   1. pnpm install（本地环境下载依赖）
 *   2. pnpm run build（后端编译）
 *   3. cd frontend && pnpm run build（前端编译）
 *   4. docker compose build（打包产物进镜像）
 *   5. docker compose up -d
 *
 * 前置检测策略：
 *   默认从 .env 解析 POSTGRES_URL / REDIS_URL，尝试 TCP 连接检测。
 *   若两者均可连接 → 仅启动 app 服务（backend + frontend）
 *   若任一不可达 → 自动启动基础设施（--infra）
 *   --app 模式跳过检测，仅启动应用（要求 PG/Redis 已就绪）
 *   --infra 跳过检测，强制启动全部服务
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import * as path from "node:path";
import * as url from "node:url";

const colors = {
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

function log(level, message) {
  const color = colors[level] || colors.info;
  console.log(`${color}[docker-start]${colors.reset} ${message}`);
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.silent ? "pipe" : "inherit",
      shell: true,
      ...options,
    });

    let stdout = "";
    let stderr = "";

    if (options.silent && child.stdout) {
      child.stdout.on("data", (data) => { stdout += data; });
    }
    if (options.silent && child.stderr) {
      child.stderr.on("data", (data) => { stderr += data; });
    }

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on("error", reject);
  });
}

function hasCommand(cmd) {
  return new Promise((resolve) => {
    const check = spawn(process.platform === "win32" ? "where" : "which", [cmd], { shell: true });
    check.on("close", (code) => resolve(code === 0));
    check.on("error", () => resolve(false));
  });
}

async function detectComposeCommand() {
  if (await hasCommand("docker-compose")) return "docker-compose";
  if (await hasCommand("docker")) {
    try {
      await run("docker", ["compose", "version"], { silent: true });
      return "docker compose";
    } catch {
      // ignore
    }
  }
  return null;
}

// ─── 前置检测 ──────────────────────────────────────────────────

/**
 * Parse a postgres:// or redis:// URL into host/port.
 */
function parseServiceUrl(connectionUrl) {
  if (!connectionUrl) return null;
  try {
    const u = new url.URL(connectionUrl);
    return {
      host: u.hostname || "127.0.0.1",
      port: Number(u.port) || (u.protocol === "postgresql:" ? 5432 : 6379),
    };
  } catch {
    // Fallback: try simple host:port regex
    const m = connectionUrl.match(/@([^:/]+):(\d+)/);
    if (m) return { host: m[1], port: Number(m[2]) };
    return null;
  }
}

/**
 * Simple TCP connect test — resolves true if port is reachable within timeout.
 */
function tcpProbe(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error", () => { sock.destroy(); resolve(false); });
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

/**
 * Try to ping Redis (AUTH not required for local dev).
 */
async function redisPing(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(timeoutMs);
    let data = "";
    sock.on("data", (chunk) => {
      data += chunk.toString();
      if (data.includes("PONG")) {
        sock.destroy();
        resolve(true);
      }
    });
    sock.on("error", () => { sock.destroy(); resolve(false); });
    sock.on("timeout", () => { sock.destroy(); resolve(false); });
    sock.on("connect", () => { sock.write("PING\r\n"); });
    sock.connect(port, host);
  });
}

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return {};
  const result = {};
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function assertPortAvailable(port, label) {
  const available = await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
  if (!available) {
    log("warn", `${label} 端口 ${port} 已被占用，将尝试继续...`);
  }
  return available;
}

/**
 * Detect whether PostgreSQL and Redis are already reachable.
 * Returns { pg: bool, redis: bool }.
 */
async function detectInfra(envPath) {
  const env = loadEnvFile(envPath);

  const pgUrl = env.POSTGRES_URL || "postgresql://localhost:5432/game_designer";
  const redisUrl = env.REDIS_URL || "redis://localhost:6379/0";

  const pgTarget = parseServiceUrl(pgUrl);
  const redisTarget = parseServiceUrl(redisUrl);

  log("info", "正在检测基础设施...");
  log("info", `  PostgreSQL → ${pgTarget?.host}:${pgTarget?.port}`);
  log("info", `  Redis      → ${redisTarget?.host}:${redisTarget?.port}`);

  const [pgAlive, redisAlive] = await Promise.all([
    pgTarget ? tcpProbe(pgTarget.host, pgTarget.port) : false,
    redisTarget ? redisPing(redisTarget.host, redisTarget.port) : false,
  ]);

  log(pgAlive ? "success" : "warn", `  PostgreSQL  ${pgAlive ? "已就绪 ✓" : "未检测到"}`);
  log(redisAlive ? "success" : "warn", `  Redis       ${redisAlive ? "已就绪 ✓" : "未检测到"}`);

  return { pg: pgAlive, redis: redisAlive };
}

// ─── 辅助 ──────────────────────────────────────────────────────

async function waitForService(urlStr, maxRetries = 30, interval = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(urlStr, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function printBanner() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          Game Designer TS — Docker 启动脚本                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
}

function printAccessInfo(infraStarted) {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      服务访问地址                            ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  前端:          http://localhost:3001                        ║");
  console.log("║  后端 API:      http://localhost:13000                       ║");
  if (infraStarted) {
    console.log("║  PostgreSQL:    localhost:5432                               ║");
    console.log("║  Redis:         localhost:6379                               ║");
  } else {
    console.log("║  PostgreSQL:    使用外部实例（非 Docker）                      ║");
    console.log("║  Redis:         使用外部实例（非 Docker）                      ║");
  }
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("提示: 按 Ctrl+C 停止日志查看，服务仍在后台运行");
  console.log("      使用 'node docker-start.mjs --down' 停止所有服务");
  console.log("      使用 'node docker-start.mjs --rebuild' 本地编译并重新部署");
  console.log("      使用 'node docker-start.mjs --infra'  强制启动基础设施");
  console.log("");
}

// ========== 主逻辑 ==========

const args = process.argv.slice(2);
const rebuildMode = args.includes("--rebuild");
const stopMode = args.includes("--down");
const logsMode = args.includes("--logs");
const forceInfra = args.includes("--infra");
const appOnly = args.includes("--app");

printBanner();

const composeCmd = await detectComposeCommand();
if (!composeCmd) {
  log("error", "未找到 Docker Compose，请先安装 Docker 和 Docker Compose");
  process.exit(1);
}
log("info", `使用命令: ${composeCmd}`);

// --down 模式
if (stopMode) {
  log("warn", "正在停止并移除所有服务...");
  try {
    await run(composeCmd, ["down", "--volumes", "--remove-orphans"]);
    log("success", "所有服务已停止并移除");
  } catch (e) {
    log("error", `停止失败: ${e.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// --logs 模式
if (logsMode) {
  log("info", "正在显示服务日志...");
  try {
    await run(composeCmd, ["logs", "-f"]);
  } catch {
    // ignore
  }
  process.exit(0);
}

// --rebuild 模式
if (rebuildMode) {
  log("info", "本地编译 → 打包进 Docker → 重启容器");
  log("info", "（Docker 内不下载依赖，利用本地网络环境）");
  console.log("");

  // Step 1: pnpm install
  log("info", "Step 1: pnpm install...");
  const installResult = spawnSync("pnpm", ["install"], { shell: true, stdio: "inherit" });
  if (installResult.status !== 0) {
    log("error", "依赖安装失败");
    process.exit(1);
  }
  log("success", "依赖安装完成");
  console.log("");

  // Step 2: 编译后端
  log("info", "Step 2: 编译后端 (pnpm run build)...");
  const backendBuild = spawnSync("pnpm", ["run", "build"], { shell: true, stdio: "inherit" });
  if (backendBuild.status !== 0) {
    log("error", "后端编译失败");
    process.exit(1);
  }
  log("success", "后端编译完成");
  console.log("");

  // Step 3: 编译前端
  log("info", "Step 3: 编译前端...");
  const frontendBuild = spawnSync("pnpm", ["run", "build"], { shell: true, stdio: "inherit", cwd: "frontend" });
  if (frontendBuild.status !== 0) {
    log("error", "前端编译失败");
    process.exit(1);
  }
  if (!existsSync("frontend/.next/standalone/frontend/server.js")) {
    log("error", "前端 standalone 入口不存在: frontend/.next/standalone/frontend/server.js");
    log("error", "请确认 frontend/next.config.* 已设置 output: 'standalone'");
    process.exit(1);
  }
  log("success", "前端编译完成");
  console.log("");

  // Step 4: 停旧容器 + 重建镜像
  log("info", "Step 4: 停旧容器并重建镜像...");
  try {
    await run(composeCmd, ["down", "--remove-orphans"]);
    await run(composeCmd, ["build"]);
    log("success", "镜像构建完成");
  } catch (e) {
    log("error", `Docker 构建失败: ${e.message}`);
    process.exit(1);
  }
  console.log("");
}

// 检查 .env
if (!existsSync(".env")) {
  log("warn", ".env 文件不存在，已从 .env.example 复制模板");
  try {
    await run("cp", [".env.example", ".env"]);
  } catch {
    log("error", "复制 .env.example 失败，请手动创建 .env 文件");
    process.exit(1);
  }
}

// ─── 决定是否启动基础设施 ──────────────────────────────────────
let startInfra = false;
let infraDetected = { pg: false, redis: false };

if (forceInfra) {
  log("info", "标记: 强制启动基础设施 (--infra)");
  startInfra = true;
} else if (appOnly) {
  log("info", "标记: 仅启动应用服务 (--app)");
  startInfra = false;
} else {
  // 智能检测模式
  infraDetected = await detectInfra(".env");
  console.log("");

  if (infraDetected.pg && infraDetected.redis) {
    log("success", "基础设施已就绪，跳过 Docker 容器启动");
    startInfra = false;
  } else {
    log("warn", "基础设施未完全就绪，将自动启动 Docker 容器");
    startInfra = true;

    // 检查端口是否可用
    const env = loadEnvFile(".env");
    const pgPort = Number(env.POSTGRES_PORT || 5432);
    const redisPort = Number(env.REDIS_PORT || 6379);
    await Promise.all([
      assertPortAvailable(pgPort, "PostgreSQL"),
      assertPortAvailable(redisPort, "Redis"),
    ]);
    console.log("");
  }
}

// ─── 解析 POSTGRES_URL / REDIS_URL ──────────────────────────────
// Docker 容器内的 backend 需要正确的地址：
//   infra 启动时  → postgres:5432 / redis:6379（Docker 内部网络）
//   infra 跳过时  → host.docker.internal:<port>（通过宿主机访问外部实例）
{
  const env = loadEnvFile(".env");
  if (startInfra) {
    const pgUser = env.POSTGRES_USER || "game_designer";
    const pgPass = env.POSTGRES_PASSWORD || "game_designer";
    const pgDb = env.POSTGRES_DB || "game_designer";
    process.env.POSTGRES_URL = `postgresql://${pgUser}:${pgPass}@postgres:5432/${pgDb}`;
    process.env.REDIS_URL = "redis://redis:6379/0";
    log("info", `POSTGRES_URL → postgres:5432 (Docker 内部)`);
  } else {
    const pgUrl = env.POSTGRES_URL || "postgresql://localhost:5432/game_designer";
    const redisUrl = env.REDIS_URL || "redis://localhost:6379/0";
    // Replace localhost/127.0.0.1 with host.docker.internal for Docker → host access
    process.env.POSTGRES_URL = pgUrl.replace(/(localhost|127\.0\.0\.1)/g, "host.docker.internal");
    process.env.REDIS_URL = redisUrl.replace(/(localhost|127\.0\.0\.1)/g, "host.docker.internal");
    log("info", `POSTGRES_URL → ${process.env.POSTGRES_URL}`);
    log("info", `REDIS_URL   → ${process.env.REDIS_URL}`);
  }
}

// ─── 启动服务 ──────────────────────────────────────────────────
const upArgs = ["up", "-d", "--remove-orphans"];
if (startInfra) {
  upArgs.splice(1, 0, "--profile", "infra");
}
const upLabel = startInfra
  ? "启动全部服务（含基础设施 + 应用）..."
  : "启动应用服务...";

log("info", upLabel);
try {
  await run(composeCmd, upArgs);
} catch (e) {
  log("error", `启动失败: ${e.message}`);
  process.exit(1);
}

// 健康检查
log("info", "等待后端健康检查...");
const backendReady = await waitForService("http://localhost:13000/health", 60, 2000);
if (backendReady) {
  log("success", "后端已就绪");
} else {
  log("warn", "后端健康检查超时，请查看日志排查");
}

printAccessInfo(startInfra);

// 显示日志
log("info", "正在显示服务日志（按 Ctrl+C 停止查看，服务仍在后台运行）");
console.log("---");
try {
  await run(composeCmd, ["logs", "-f"]);
} catch {
  // User pressed Ctrl+C
}
