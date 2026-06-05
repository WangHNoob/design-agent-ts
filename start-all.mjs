/**
 * 一键启动脚本：同时运行后端服务与前端开发服务器
 *
 * 为什么用 Node.js 脚本而不是 .bat？
 * - 彻底避免 Windows CMD/BAT 的中文编码乱码问题（UTF-8 无需额外设置）
 * - 跨平台：Windows、macOS、Linux 均可直接运行
 * - 无需额外依赖（如 concurrently），使用 Node.js 内置 child_process
 * - 彩色前缀区分前后端日志，Ctrl+C 一次性优雅退出
 *
 * 用法：
 *   node start-all.mjs            # 直接启动本地开发（需先手动 pnpm run build）
 *   node start-all.mjs --build    # 自动编译后再启动本地开发
 *   node start-all.mjs --docker   # 重建 Docker 镜像并重启容器（部署模式）
 *
 * 前置条件：
 *   1. 根目录已执行 `pnpm run build`（生成 dist/server/main.js）
 *   2. 若 frontend/node_modules 不存在，脚本会自动执行 `pnpm install`
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import net from "node:net";

const colors = {
  server: "\x1b[36m",   // 青色 (Cyan)
  frontend: "\x1b[35m", // 洋红 (Magenta)
  docker: "\x1b[33m",   // 黄色 (Yellow)
  reset: "\x1b[0m",
};

const processes = [];

function run(tag, color, command, args, cwd = process.cwd(), useShell = true) {
  const prefix = `${color}[${tag}]${colors.reset}`;

  const child = spawn(command, args, {
    cwd,
    shell: useShell,
    stdio: ["pipe", "pipe", "pipe"],
  });

  processes.push(child);

  child.stdout.on("data", (data) => {
    data
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .forEach((line) => console.log(`${prefix} ${line}`));
  });

  child.stderr.on("data", (data) => {
    data
      .toString()
      .split(/\r?\n/)
      .filter((line) => line.trim() !== "")
      .forEach((line) => console.error(`${prefix} ${line}`));
  });

  child.on("close", (code) => {
    console.log(`${prefix} 进程已退出，退出码: ${code}`);
    shutdown();
  });

  return child;
}

function shutdown() {
  console.log("\n正在关闭所有子进程...");
  processes.forEach((p) => {
    if (!p.killed) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", p.pid, "/f", "/t"], { shell: true });
      } else {
        p.kill("SIGTERM");
      }
    }
  });
  setTimeout(() => process.exit(0), 500);
}

// 优雅退出
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (process.platform === "win32") {
  createInterface({ input: process.stdin, output: process.stdout }).on("SIGINT", shutdown);
}

// 从 .env 读取后端端口
function getServerPort() {
  if (!existsSync(".env")) return 3000;
  const content = readFileSync(".env", "utf-8");
  const match = content.match(/^PORT\s*=\s*(\d+)/m);
  return match ? Number(match[1]) : 3000;
}

// 检测端口是否可用
function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

// 同步前端 API 地址
function syncFrontendApiBase(port) {
  const envLocalPath = "frontend/.env.local";
  let content = "";
  if (existsSync(envLocalPath)) {
    content = readFileSync(envLocalPath, "utf-8");
  }
  const lines = content.split(/\r?\n/);
  let foundApi = false;
  const newLines = lines.map((line) => {
    if (line.startsWith("NEXT_PUBLIC_API_BASE=")) {
      foundApi = true;
      return `NEXT_PUBLIC_API_BASE=http://localhost:${port}`;
    }
    return line;
  });
  if (!foundApi) {
    newLines.push(`NEXT_PUBLIC_API_BASE=http://localhost:${port}`);
  }
  writeFileSync(envLocalPath, newLines.filter((l) => l !== "").join("\n") + "\n");
}

// 等待后端健康检查
async function waitForHealth(port, maxRetries = 30) {
  const url = `http://127.0.0.1:${port}/health`;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ========== --docker 模式 ==========

const dockerMode = process.argv.includes("--docker");

if (dockerMode) {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║    Game Designer TS — Docker 重建并部署模式                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Step 1: 编译后端 TypeScript
  console.log("[DOCKER] Step 1: 编译后端 TypeScript...\n");
  const buildResult = spawnSync("pnpm", ["run", "build"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (buildResult.status !== 0) {
    console.error("\n编译失败，请修复上方错误后重试。");
    process.exit(1);
  }
  console.log("\n[DOCKER] 后端编译完成\n");

  // Step 2: 检测 docker compose 命令
  const dockerComposeCmd = process.platform === "win32"
    ? "docker compose"
    : (await new Promise((resolve) => {
        const checkCompose = spawn("which", ["docker-compose"], { shell: true });
        checkCompose.on("close", (code) => resolve(code === 0 ? "docker-compose" : "docker compose"));
      }));

  console.log(`[DOCKER] 使用命令: ${dockerComposeCmd}\n`);

  // Step 3: 停止旧容器
  console.log("[DOCKER] Step 2: 停止旧容器...\n");
  const downResult = spawnSync(dockerComposeCmd, ["down", "--remove-orphans"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  console.log("");

  // Step 4: 无缓存重建镜像
  console.log("[DOCKER] Step 3: 无缓存重建 Docker 镜像（耗时较长）...\n");
  const buildDockerResult = spawnSync(dockerComposeCmd, ["build", "--no-cache"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (buildDockerResult.status !== 0) {
    console.error("\nDocker 镜像构建失败，请查看上方错误。");
    process.exit(1);
  }
  console.log("\n[DOCKER] 镜像构建完成\n");

  // Step 5: 启动新容器
  console.log("[DOCKER] Step 4: 启动新容器...\n");
  const upResult = spawnSync(dockerComposeCmd, ["up", "-d", "--remove-orphans"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (upResult.status !== 0) {
    console.error("\n容器启动失败。");
    process.exit(1);
  }

  // Step 6: 健康检查
  console.log("\n[DOCKER] Step 5: 等待后端健康检查...");
  const backendReady = await waitForHealth(13000, 30);
  if (backendReady) {
    console.log("[DOCKER] 后端已就绪");
  } else {
    console.error("[DOCKER] 后端健康检查超时，请查看日志排查");
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      服务访问地址                            ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  前端:          http://localhost:3001                        ║");
  console.log("║  后端 API:      http://localhost:13000                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  process.exit(0);
}

// ========== 本地开发模式 ==========

const shouldBuild = process.argv.includes("--build");
if (shouldBuild) {
  console.log("检测到 --build 参数，正在重新编译 TypeScript...\n");
  const buildResult = spawnSync("pnpm", ["run", "build"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (buildResult.status !== 0) {
    console.error("\n编译失败，请修复上方错误后重试。");
    process.exit(1);
  }
  console.log("\n编译完成\n");
}

// ========== 前置检查 ==========

if (!existsSync("dist/server/main.js")) {
  console.error("错误：未找到 dist/server/main.js，请先执行 pnpm run build");
  process.exit(1);
}

if (!existsSync("frontend/node_modules")) {
  console.log("frontend/node_modules 不存在，正在自动安装依赖...");
  const result = spawnSync("pnpm", ["install"], { shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.error("依赖安装失败，请在根目录执行 pnpm install");
    process.exit(1);
  }
  console.log("依赖安装完成");
}

const serverPort = getServerPort();

// 检查后端端口是否已被占用
const serverPortAvailable = await isPortAvailable(serverPort);
if (!serverPortAvailable) {
  console.error(`错误：端口 ${serverPort} 已被占用，后端无法启动。`);
  console.error(`   请先结束占用该端口的进程，或修改 .env 中的 PORT 配置。`);
  process.exit(1);
}

// 同步前端 API 地址
syncFrontendApiBase(serverPort);

console.log(`正在启动后端服务 (端口 ${serverPort}) 与前端开发服务器...\n`);

// 启动后端
run("SERVER", colors.server, "node", ["--env-file=.env", "dist/server/main.js"]);

// 启动前端
run("FRONTEND", colors.frontend, "pnpm", ["run", "dev"], "frontend");

// 等待后端就绪
waitForHealth(serverPort).then((ok) => {
  if (ok) {
    console.log(`\n后端已就绪: http://localhost:${serverPort}`);
    console.log(`前端地址: http://localhost:4528\n`);
  } else {
    console.error(`\n后端在 ${serverPort} 端口未通过健康检查，请查看上方日志排查问题。`);
  }
});