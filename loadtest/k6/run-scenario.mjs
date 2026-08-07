import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const scenarioArg = process.argv[2];
if (!scenarioArg) {
  console.error("Usage: node loadtest/k6/run-scenario.mjs <scenario-name>");
  console.error("Example: node loadtest/k6/run-scenario.mjs 01-health-metrics");
  process.exit(1);
}

const name = scenarioArg.replace(/\.js$/, "");
const scriptHost = path.resolve(__dirname, "scenarios", `${name}.js`);
if (!fs.existsSync(scriptHost)) {
  console.error(`Scenario not found: ${scriptHost}`);
  process.exit(1);
}

const reportsDir = path.resolve(root, "loadtest", "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryFile = path.resolve(reportsDir, `${name}-${stamp}-summary.json`);

// Host-run backend defaults to localhost; Docker-k6 needs host.docker.internal.
const preferLocalK6 = process.env.LOADTEST_K6_MODE !== "docker";
const defaultBaseUrl = preferLocalK6
  ? "http://localhost:13000"
  : "http://host.docker.internal:13000";
const baseUrl = process.env.BASE_URL || defaultBaseUrl;
const image = process.env.K6_IMAGE || "grafana/k6:0.54.0";

function resolveLocalK6() {
  const candidates = [
    process.env.K6_BIN,
    "C:\\Program Files\\k6\\k6.exe",
    "k6",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate !== "k6" && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["version"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if ((probe.status ?? 1) === 0) return candidate;
  }

  const which = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["k6"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if ((which.status ?? 1) !== 0) return null;
  const first = String(which.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  return first || null;
}

function runLocalK6(k6Path) {
  const env = { ...process.env, BASE_URL: baseUrl };
  if (process.env.VUS) env.VUS = process.env.VUS;
  if (process.env.DURATION) env.DURATION = process.env.DURATION;
  if (process.env.ORIGIN) env.ORIGIN = process.env.ORIGIN;
  else if (!env.ORIGIN) env.ORIGIN = "http://localhost:3001";
  for (const key of ["LLM_USERS", "LLM_ITERS_PER_USER", "LLM_EXEC_TIMEOUT_SEC"]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  console.log(`Running local k6 scenario ${name} against ${baseUrl}`);
  // Do not use shell:true — paths with spaces (e.g. Program Files) break otherwise.
  const result = spawnSync(
    k6Path,
    ["run", "--summary-export", summaryFile, scriptHost],
    { stdio: "inherit", env, windowsHide: true },
  );
  return result.status ?? 1;
}

function runDockerK6() {
  const k6Root = path.resolve(root, "loadtest", "k6");
  const args = [
    "run",
    "--rm",
    "-v",
    `${k6Root}:/scripts:ro`,
    "-v",
    `${reportsDir}:/reports`,
    "-e",
    `BASE_URL=${baseUrl}`,
  ];
  if (process.env.VUS) args.push("-e", `VUS=${process.env.VUS}`);
  if (process.env.DURATION) args.push("-e", `DURATION=${process.env.DURATION}`);
  args.push("-e", `ORIGIN=${process.env.ORIGIN || "http://localhost:3001"}`);
  args.push(
    image,
    "run",
    "--summary-export",
    `/reports/${path.basename(summaryFile)}`,
    `/scripts/scenarios/${name}.js`,
  );

  console.log(`Running docker k6 scenario ${name} against ${baseUrl}`);
  const result = spawnSync("docker", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

const localK6 = preferLocalK6 ? resolveLocalK6() : null;
const code = localK6 ? runLocalK6(localK6) : runDockerK6();
process.exit(code);
