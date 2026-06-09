/**
 * Docker 环境启动脚本
 *
 * 用法:
 *   node docker-start.mjs           # 启动已有镜像（不重新编译）
 *   node docker-start.mjs --rebuild # 本地编译 → 打包进 Docker → 启动
 *   node docker-start.mjs --down    # 停止并移除所有服务
 *   node docker-start.mjs --logs    # 查看所有服务日志
 *
 * --rebuild 流程：
 *   1. pnpm install（本地环境下载依赖，网络稳定）
 *   2. pnpm run build（后端编译）
 *   3. cd frontend && pnpm run build（前端编译）
 *   4. docker compose build（打包产物进镜像，无需网络）
 *   5. docker compose up -d
 *
 * Dockerfile 采用本地预编译模式，镜像内不含 pnpm install / build 步骤。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
  console.log("      使用 'node docker-start.mjs --rebuild' 本地编译并重新部署");
  console.log("");
}

// ========== 主逻辑 ==========

const args = process.argv.slice(2);
const rebuildMode = args.includes("--rebuild");
const stopMode = args.includes("--down");
const logsMode = args.includes("--logs");

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

// --rebuild 模式：本地编译 → 打包进 Docker
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

// 启动服务
log("info", "启动全部服务...");
const composeArgs = ["up", "-d", "--remove-orphans"];
try {
  await run(composeCmd, composeArgs);
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

printAccessInfo();

// 显示日志
log("info", "正在显示服务日志（按 Ctrl+C 停止查看，服务仍在后台运行）");
console.log("---");
try {
  await run(composeCmd, ["logs", "-f"]);
} catch {
  // User pressed Ctrl+C
}
