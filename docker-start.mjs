/**
 * Docker 环境一键启动脚本
 *
 * 用法:
 *   node docker-start.mjs           # 启动全部服务
 *   node docker-start.mjs --infra   # 只启动基础设施（postgres + redis），本地开发用
 *   node docker-start.mjs --build   # 强制重新构建镜像后启动
 *   node docker-start.mjs --down    # 停止并移除所有服务
 *   node docker-start.mjs --logs    # 查看所有服务日志
 *
 * 前置条件:
 *   1. 已安装 Docker 和 Docker Compose
 *   2. .env 文件已配置（可从 .env.example 复制）
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import net from "node:net";

const colors = {
  info: "\x1b[36m",    // 青色
  success: "\x1b[32m", // 绿色
  warn: "\x1b[33m",    // 黄色
  error: "\x1b[31m",   // 红色
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

async function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function waitForPort(port, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    if (!(await isPortAvailable(port))) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function waitForService(url, maxRetries = 30, interval = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
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

function printAccessInfo() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      🚀 服务访问地址                          ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  主前端:        http://localhost:3001                        ║");
  console.log("║  主后端 API:    http://localhost:13000                       ║");
  console.log("║  PostgreSQL:    localhost:15432                              ║");
  console.log("║  Redis:         localhost:16379                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("提示: 按 Ctrl+C 停止日志查看，服务仍在后台运行");
  console.log("      使用 'node docker-start.mjs --down' 停止所有服务");
  console.log("");
}

function printInfraInfo() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              🚀 基础设施已启动（本地开发模式）                ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  PostgreSQL:    localhost:15432                              ║");
  console.log("║  Redis:         localhost:16379                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("接下来可以运行本地开发服务:");
  console.log("  主后端:   node --env-file=.env dist/server/main.js");
  console.log("  主前端:   cd frontend && npm run dev");
  console.log("");
  console.log("或使用: node start-all.mjs");
  console.log("");
}

// ========== 主逻辑 ==========

const args = process.argv.slice(2);
const infraOnly = args.includes("--infra");
const forceBuild = args.includes("--build");
const stopMode = args.includes("--down");
const logsMode = args.includes("--logs");

printBanner();

// 检查 Docker
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
    await run(composeCmd, ["down", "--volumes"]);
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

// 检查关键端口是否被占用（使用非标准端口避免与其他应用冲突）
const portsToCheck = infraOnly
  ? [15432, 16379]
  : [13000, 3001, 15432, 16379];

const occupiedPorts = [];
for (const port of portsToCheck) {
  if (!(await isPortAvailable(port))) {
    occupiedPorts.push(port);
  }
}

if (occupiedPorts.length > 0) {
  log("warn", `以下端口已被占用: ${occupiedPorts.join(", ")}`);
  if (!infraOnly) {
    log("warn", "如果已运行 'node start-all.mjs'，请先停止它");
  }
}

// 构建启动参数
const composeArgs = ["up"];
if (forceBuild) {
  composeArgs.push("--build");
}

if (infraOnly) {
  log("info", "启动基础设施服务: PostgreSQL + Redis...");
  composeArgs.push("postgres", "redis");
} else {
  log("info", "启动全部服务...");
  composeArgs.push("--remove-orphans");
}

// 启动服务
log("info", `执行: ${composeCmd} ${composeArgs.join(" ")}`);

try {
  // 在后台启动（detached mode）以便我们可以做健康检查
  composeArgs.push("-d");
  await run(composeCmd, composeArgs);
} catch (e) {
  log("error", `启动失败: ${e.message}`);
  process.exit(1);
}

// 健康检查
if (infraOnly) {
  log("info", "等待 PostgreSQL 就绪...");
  const pgPortReady = await waitForPort(15432, 30);
  if (pgPortReady) {
    log("success", "PostgreSQL 已就绪 (localhost:15432)");
  } else {
    log("error", "PostgreSQL 未在预期时间内就绪");
  }

  log("info", "等待 Redis 就绪...");
  const redisPortReady = await waitForPort(16379, 30);
  if (redisPortReady) {
    log("success", "Redis 已就绪 (localhost:16379)");
  } else {
    log("error", "Redis 未在预期时间内就绪");
  }

  printInfraInfo();
} else {
  log("info", "等待服务健康检查...");

  const backendReady = await waitForService("http://localhost:3000/health", 60, 2000);
  if (backendReady) {
    log("success", "主后端已就绪");
  } else {
    log("warn", "主后端健康检查超时，请查看日志排查");
  }

  printAccessInfo();

  // 显示日志
  log("info", "正在显示服务日志（按 Ctrl+C 停止查看，服务仍在后台运行）");
  console.log("---");
  try {
    await run(composeCmd, ["logs", "-f"]);
  } catch {
    // User pressed Ctrl+C
  }
}
