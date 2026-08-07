import { check, sleep } from "k6";
import exec from "k6/execution";
import { thresholds, llmDefaults } from "../lib/config.js";
import { authGet, authPost } from "../lib/auth.js";
import { createUserPool, getUserForVu } from "../lib/userPool.js";

const USERS = llmDefaults.users;
const ITERS = llmDefaults.itersPerUser;
const TIMEOUT_SEC = llmDefaults.execTimeoutSec;
const TOTAL = USERS * ITERS;

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
  check(null, { "pool user bound": () => Boolean(user?.cookie) });
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

  const accepted = check(create, {
    "execute 202": (r) => r.status === 202,
  });
  if (!accepted) {
    sleep(1);
    return;
  }

  let executionId;
  try {
    executionId = JSON.parse(String(create.body)).executionId;
  } catch (_) {
    check(null, { "parse executionId": () => false });
    return;
  }

  const terminal = pollUntilTerminal(user.cookie, executionId, TIMEOUT_SEC);
  check(null, {
    "execution completed": () => terminal.status === "completed",
  });

  sleep(0.5);
}
