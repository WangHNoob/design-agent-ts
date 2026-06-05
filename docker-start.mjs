/**
 * Docker 环境一键启动脚本
 *
 * 用法:
 *   node docker-start.mjs           # 启动全部服务
 *   node docker-start.mjs --build   # 重建镜像后启动
 *   node docker-start.mjs --rebuild # 无缓存重建镜像后启动（代码变更后使用）
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
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
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

async function waitForService(url, maxRetries = 30, interval = 2000) {
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
  console.log("║                      服务访问地址                            ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  前端:          http://localhost:3001                        ║");
  console.log("║  后端 API:      http://localhost:13000                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("提示: 按 Ctrl+C 停止日志查看，服务仍在后台运行");
  console.log("      使用 'node docker-start.mjs --down' 停止所有服务");
  console.log("      使用 'node docker-start.mjs --rebuild' 重建并启动");
  console.log("");
}

// ========== 主逻辑 ==========

const args = process.argv.slice(2);
const forceBuild = args.includes("--build");
const noCacheRebuild = args.includes("--rebuild");
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

// --rebuild 模式：无缓存重建
if (noCacheRebuild) {
  log("info", "正在无缓存重建所有镜像（代码变更后推荐使用）...");
  try {
    await run(composeCmd, ["build", "--no-cache"]);
    log("success", "镜像重建完成");
  } catch (e) {
    log("error", `重建失败: ${e.message}`);
    process.exit(1);
  }
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

// 检查端口
const portsToCheck = [13000, 3001];
const occupiedPorts = [];
for (const port of portsToCheck) {
  if (!(await isPortAvailable(port))) {
    occupiedPorts.push(port);
  }
}

if (occupiedPorts.length > 0) {
  log("warn", `以下端口已被占用: ${occupiedPorts.join(", ")}`);
  log("warn", "如果已运行服务，请先执行: node docker-start.mjs --down");
}

// 构建启动参数
const composeArgs = ["up", "--remove-orphans"];
if (forceBuild) {
  composeArgs.push("--build");
}

log("info", `启动全部服务...`);

// 启动服务（后台模式，以便做健康检查）
composeArgs.push("-d");
log("info", `执行: ${composeCmd} ${composeArgs.join(" ")}`);

try {
  await run(composeCmd, composeArgs);
} catch (e) {
  log("error", `启动失败: ${e.message}`);
  process.exit(1);
}

// 健康检查（使用映射端口 13000）
log("info", "等待后端健康检查...");
const backendReady = await waitForService("http://localhost:13000/health", 60, 2000);
if (backendReady) {
  log("success", "后端已就绪");
} else {
  log("warn", "后端健康检查超时，请查看日志排查");
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