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
 *   node start-all.mjs            # 直接启动（需先手动 pnpm run build）
 *   node start-all.mjs --build    # 自动编译后再启动
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

// ========== --build 参数支持 ==========

const shouldBuild = process.argv.includes("--build");
if (shouldBuild) {
  console.log("⚙️  检测到 --build 参数，正在重新编译 TypeScript...\n");
  const buildResult = spawnSync("pnpm", ["run", "build"], {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  });
  if (buildResult.status !== 0) {
    console.error("\n❌ 编译失败，请修复上方错误后重试。");
    process.exit(1);
  }
  console.log("\n✅ 编译完成\n");
}

// ========== 前置检查 ==========

if (!existsSync("dist/server/main.js")) {
  console.error("❌ 错误：未找到 dist/server/main.js，请先执行 pnpm run build");
  process.exit(1);
}

if (!existsSync("frontend/node_modules")) {
  console.log("⚙️  frontend/node_modules 不存在，正在自动安装依赖...");
  const result = spawnSync("pnpm", ["install"], { shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.error("❌ 依赖安装失败，请在根目录执行 pnpm install");
    process.exit(1);
  }
  console.log("✅ 依赖安装完成");
}

const serverPort = getServerPort();

// 检查后端正要使用的端口是否已被占用
const serverPortAvailable = await isPortAvailable(serverPort);
if (!serverPortAvailable) {
  console.error(`❌ 错误：端口 ${serverPort} 已被占用，后端无法启动。`);
  console.error(`   请先结束占用该端口的进程，或修改 .env 中的 PORT 配置。`);
  if (serverPort === 3000) {
    console.error(`   提示：可尝试执行 "npx kill-port 3000" 或手动结束 node 进程。`);
  }
  process.exit(1);
}

// 如果后端不用 3000，而 3000 被其他进程占用，给出警告（常见陷阱）
if (serverPort !== 3000) {
  const port3000Available = await isPortAvailable(3000);
  if (!port3000Available) {
    console.warn(`⚠️  警告：3000 端口被其他进程占用，但后端将运行在 ${serverPort}。`);
    console.warn(`   前端已自动配置为请求 http://localhost:${serverPort}。`);
  }
}

// 同步前端 API 地址
syncFrontendApiBase(serverPort);

console.log(`🚀 正在启动后端服务 (端口 ${serverPort}) 与前端开发服务器 (端口 4528)...\n`);

// 启动后端
run("SERVER", colors.server, "node", ["--env-file=.env", "dist/server/main.js"]);

// 启动前端
run("FRONTEND", colors.frontend, "pnpm", ["run", "dev"], "frontend");

// 等待后端就绪
waitForHealth(serverPort).then((ok) => {
  if (ok) {
    console.log(`\n✅ 后端已就绪: http://localhost:${serverPort}`);
    console.log(`🌐 主前端地址: http://localhost:4528\n`);
  } else {
    console.error(`\n⚠️  后端在 ${serverPort} 端口未通过健康检查，请查看上方日志排查问题。`);
  }
});
