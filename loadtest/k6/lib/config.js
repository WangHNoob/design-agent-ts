export const BASE_URL = __ENV.BASE_URL || "http://host.docker.internal:13000";

/**
 * Better Auth rejects sign-in without a trusted Origin (MISSING_OR_NULL_ORIGIN).
 * Must match TRUSTED_ORIGINS in server .env (default frontend origin).
 */
export const ORIGIN = __ENV.ORIGIN || "http://localhost:3001";

export const thresholds = {
  health: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
  auth: {
    // Scenario intentionally probes 401 unauth — do not use http_req_failed.
    checks: ["rate>0.95"],
    http_req_duration: ["p(95)<800"],
  },
  readApis: {
    // Some read paths may 404 when empty/disabled — assert via checks, not http_req_failed.
    checks: ["rate>0.95"],
    http_req_duration: ["p(95)<500"],
  },
  execute: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
    checks: ["rate>0.95"],
  },
  hitl: {
    // Second review expects 409 — assert via checks, not http_req_failed.
    checks: ["rate>0.90"],
    http_req_duration: ["p(95)<3000"],
  },
  /** Real-LLM query: long model latency; abort if checks drop below 90%. */
  llmQuery: {
    checks: ["rate>0.90"],
    http_req_duration: ["p(95)<180000"],
  },
};

export const llmDefaults = {
  users: Number(__ENV.LLM_USERS || 30),
  itersPerUser: Number(__ENV.LLM_ITERS_PER_USER || 2),
  execTimeoutSec: Number(__ENV.LLM_EXEC_TIMEOUT_SEC || 180),
};

export function uniqueEmail(prefix) {
  const vu = typeof __VU !== "undefined" ? __VU : 0;
  const iter = typeof __ITER !== "undefined" ? __ITER : 0;
  return `${prefix}-vu${vu}-i${iter}-${Date.now()}@loadtest.local`;
}

export function jsonHeaders(cookieHeader) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: ORIGIN,
    Referer: `${ORIGIN}/`,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}
