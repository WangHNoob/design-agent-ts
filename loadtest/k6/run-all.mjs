import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarios = [
  "01-health-metrics",
  "02-auth-session",
  "03-read-apis",
  "04-execute-mock",
  "05-hitl-review",
  "06-rate-limit",
];

let failed = 0;
for (const s of scenarios) {
  console.log(`\n=== ${s} ===\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, "run-scenario.mjs"), s], {
    stdio: "inherit",
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) {
    failed += 1;
    console.error(`Scenario ${s} FAILED`);
  }
}

console.log(`\nDone. Failed scenarios: ${failed}/${scenarios.length}`);
process.exit(failed === 0 ? 0 : 1);
