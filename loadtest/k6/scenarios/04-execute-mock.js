import { check, sleep } from "k6";
import { thresholds } from "../lib/config.js";
import { registerAndLogin, authGet, authPost } from "../lib/auth.js";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "5m",
  thresholds: thresholds.execute,
};

function pollUntilTerminal(cookie, executionId, maxWaitSec = 90) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    const res = authGet(`/api/console/executions/${executionId}`, cookie, { name: "exec_get" });
    if (res.status === 200) {
      try {
        const body = JSON.parse(String(res.body));
        // GET /api/console/executions/:id returns Execution directly (top-level status)
        const status = body.status || body.execution?.status;
        if (["completed", "failed", "cancelled", "timed_out"].includes(status)) {
          return { status, res };
        }
      } catch (_) {}
    }
    sleep(1);
  }
  return { status: "timeout_wait", res: null };
}

export default function () {
  const session = registerAndLogin("s04");
  if (!session) {
    sleep(1);
    return;
  }

  const idem = `idem-s04-${__VU}-${__ITER}-${Date.now()}`;
  const payload = {
    requirement: "loadtest query: what is a mock agent?",
    mode: "query",
  };

  const create = authPost(
    "/api/console/execute",
    session.cookie,
    payload,
    { name: "execute_create" },
    { "Idempotency-Key": idem },
  );

  check(create, {
    "execute 202": (r) => r.status === 202,
  });

  if (create.status !== 202) {
    sleep(1);
    return;
  }

  const created = JSON.parse(String(create.body));
  const executionId = created.executionId;

  const replay = authPost(
    "/api/console/execute",
    session.cookie,
    payload,
    { name: "execute_idempotent" },
    { "Idempotency-Key": idem },
  );
  check(replay, {
    "idempotent 202": (r) => r.status === 202,
    "idempotent same id": (r) => {
      try {
        return JSON.parse(String(r.body)).executionId === executionId;
      } catch {
        return false;
      }
    },
    "idempotent created false": (r) => {
      try {
        return JSON.parse(String(r.body)).created === false;
      } catch {
        return false;
      }
    },
  });

  const terminal = pollUntilTerminal(session.cookie, executionId, 90);
  check(null, {
    "execution completed": () => terminal.status === "completed",
  });

  const events = authGet(
    `/api/console/executions/${executionId}/events?afterCursor=0-0`,
    session.cookie,
    { name: "sse_resume" },
  );
  check(events, {
    "events not 5xx": (r) => r.status < 500,
  });

  sleep(0.5);
}
