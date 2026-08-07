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
const summaryOut = path.resolve(reportsDir, `${name}-${stamp}-summary.json`);

const baseUrl = process.env.BASE_URL || "http://host.docker.internal:13000";
const image = process.env.K6_IMAGE || "grafana/k6:0.54.0";

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
args.push(
  image,
  "run",
  "--summary-export",
  `/reports/${path.basename(summaryOut)}`,
  `/scripts/scenarios/${name}.js`,
);

console.log(`Running k6 scenario ${name} against ${baseUrl}`);
const result = spawnSync("docker", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
