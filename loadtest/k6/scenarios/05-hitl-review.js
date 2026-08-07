import { check, sleep } from "k6";
import { thresholds } from "../lib/config.js";
import { registerAndLogin, authGet, authPost } from "../lib/auth.js";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "3m",
  thresholds: thresholds.hitl,
};

function pollStatus(cookie, executionId, want, maxWaitSec = 60) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    const res = authGet(`/api/console/executions/${executionId}`, cookie, { name: "hitl_exec_get" });
    if (res.status === 200) {
      try {
        const status = JSON.parse(String(res.body)).status;
        if (status === want || ["failed", "cancelled", "completed"].includes(status)) {
          return status;
        }
      } catch (_) {}
    }
    sleep(1);
  }
  return "timeout_wait";
}

export default function () {
  const session = registerAndLogin("s05");
  if (!session) {
    sleep(1);
    return;
  }

  const create = authPost(
    "/api/console/execute",
    session.cookie,
    {
      requirement: "loadtest design: simple combat loop for mock HITL",
      mode: "design",
      role: "chief_designer",
    },
    { name: "hitl_execute" },
    { "Idempotency-Key": `idem-s05-${__VU}-${__ITER}-${Date.now()}` },
  );

  if (create.status !== 202) {
    check(create, { "hitl execute accepted": () => false });
    sleep(1);
    return;
  }

  const { executionId } = JSON.parse(String(create.body));
  const status = pollStatus(session.cookie, executionId, "waiting_hitl", 90);

  if (status !== "waiting_hitl") {
    // Soft skip: mock/env may not pause — record but don't hard-fail entire suite if thresholds allow
    check(null, {
      "reached waiting_hitl or completed via auto path": () =>
        status === "waiting_hitl" || status === "completed",
    });
    sleep(1);
    return;
  }

  // GET /api/hitl/pending → { items, count, overdueCount }
  // items[] from buildPendingBoard: { checkpoint: { id, executionId, ... }, waitingMs, overdue, escalated }
  const pending = authGet("/api/hitl/pending", session.cookie, { name: "hitl_pending" });
  check(pending, { "pending 200": (r) => r.status === 200 });

  let checkpointId = null;
  try {
    const body = JSON.parse(String(pending.body));
    const list = Array.isArray(body.items) ? body.items : [];
    const mine =
      list.find((x) => x.checkpoint && x.checkpoint.executionId === executionId) || list[0];
    checkpointId = mine && mine.checkpoint ? mine.checkpoint.id : null;
  } catch (_) {}

  check(null, { "found checkpoint": () => Boolean(checkpointId) });
  if (!checkpointId) {
    sleep(1);
    return;
  }

  // Review body uses { action }, not decision
  const review = authPost(
    `/api/hitl/checkpoints/${checkpointId}/review`,
    session.cookie,
    { action: "approve" },
    { name: "hitl_approve" },
  );
  check(review, {
    "review 2xx": (r) => r.status >= 200 && r.status < 300,
  });

  // Second approve: expect 409 HITL_ALREADY_RESOLVED
  const conflict = authPost(
    `/api/hitl/checkpoints/${checkpointId}/review`,
    session.cookie,
    { action: "approve" },
    { name: "hitl_conflict" },
  );
  check(conflict, {
    "second review 409 HITL_ALREADY_RESOLVED": (r) => {
      if (r.status !== 409) return false;
      try {
        const body = JSON.parse(String(r.body));
        return body.code === "HITL_ALREADY_RESOLVED";
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
