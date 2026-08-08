import { check, sleep, Counter } from "k6";
import exec from "k6/execution";
import { thresholds, llmDefaults } from "../lib/config.js";
import { authGet, authPost } from "../lib/auth.js";
import { createUserPool, getUserForVu } from "../lib/userPool.js";

const USERS = llmDefaults.users;
const ITERS = llmDefaults.itersPerUser;
const TIMEOUT_SEC = llmDefaults.execTimeoutSec;
const TOTAL = USERS * ITERS;

/**
 * Per-check counters so the merged JSON summary breaks down WHICH check
 * failed — the built-in `checks` metric only aggregates across all checks,
 * which made earlier failures (e.g. "execution completed" under a degraded
 * LLM) indistinguishable from auth/parse failures.
 */
const CHECK_NAMES = ["pool user bound", "execute 202", "parse executionId", "execution completed"];
const checkCounters = Object.fromEntries(
  CHECK_NAMES.map((name) => [name, new Counter(`check_${name.replace(/\s+/g, "_")}`)]),
);

function namedCheck(name, cond, value) {
  const ok = check(value, { [name]: cond });
  checkCounters[name].add(ok ? 1 : 0);
  return ok;
}

export function handleSummary(data) {
  const perCheck = {};
  for (const name of CHECK_NAMES) {
    const metric = data.metrics[`check_${name.replace(/\s+/g, "_")}`];
    perCheck[name] = metric ? { count: metric.values.count ?? 0 } : { count: 0 };
  }
  const merged = data.metrics.checks;
  const summary = {
    ...data,
    per_check: perCheck,
    checks_aggregate: merged
      ? { passes: merged.values.passes, fails: merged.values.fails, rate: merged.values.rate }
      : null,
  };
  // Print the breakdown to stdout as well (k6 console is captured in logs).
  console.log(`[per-check] ${JSON.stringify(perCheck)}`);
  return { "stdout": JSON.stringify(summary, null, 2) };
}

export const options = {
  scenarios: {
    llm_query: {
      executor: "per-vu-iterations",
      vus: USERS,
      iterations: ITERS,
      maxDuration: `${Math.max(10, Math.ceil((TIMEOUT_SEC * ITERS) / 60) + 15)}m`,
    },
  },
  thresholds: thresholds.llmQuery,
};

export function setup() {
  console.log(
    `LLM query loadtest: users=${USERS} itersPerUser=${ITERS} totalExecutions=${TOTAL} timeoutSec=${TIMEOUT_SEC}`,
  );
  const users = createUserPool(USERS, "llm07");
  console.log(`userPool ready: ${users.length} users`);
  return { users };
}

function pollUntilTerminal(cookie, executionId, maxWaitSec) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    const res = authGet(`/api/console/executions/${executionId}`, cookie, { name: "llm_exec_get" });
    if (res.status === 200) {
      try {
        const body = JSON.parse(String(res.body));
        const status = body.status || body.execution?.status;
        if (["completed", "failed", "cancelled", "timed_out"].includes(status)) {
          return { status, res };
        }
      } catch (_) {
        /* ignore */
      }
    }
    sleep(2);
  }
  return { status: "timeout_wait", res: null };
}

export default function (data) {
  const vu = exec.vu.idInTest;
  const user = getUserForVu(data.users, vu);
  namedCheck("pool user bound", (u) => Boolean(u?.cookie), user);
  if (!user?.cookie) {
    sleep(1);
    return;
  }

  const iter = exec.vu.iterationInScenario;
  const idem = `idem-llm07-vu${vu}-i${iter}-${Date.now()}`;
  const payload = {
    requirement: `loadtest real-llm query vu=${vu} iter=${iter}: in one short sentence, what is a damage formula in RPG combat?`,
    mode: "query",
  };

  const create = authPost(
    "/api/console/execute",
    user.cookie,
    payload,
    { name: "llm_execute_create" },
    { "Idempotency-Key": idem },
  );

  const accepted = namedCheck("execute 202", (r) => r.status === 202, create);
  if (!accepted) {
    sleep(1);
    return;
  }

  let executionId;
  try {
    executionId = JSON.parse(String(create.body)).executionId;
  } catch (_) {
    namedCheck("parse executionId", () => false, null);
    return;
  }

  const terminal = pollUntilTerminal(user.cookie, executionId, TIMEOUT_SEC);
  namedCheck("execution completed", (t) => t.status === "completed", terminal);
  if (terminal.status !== "completed") {
    console.warn(`vu=${vu} iter=${iter} terminal=${terminal.status} executionId=${executionId}`);
  }

  sleep(0.5);
}
