export const BASE_URL = __ENV.BASE_URL || "http://host.docker.internal:13000";

export const thresholds = {
  health: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
  auth: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
  readApis: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
  execute: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
    checks: ["rate>0.95"],
  },
  hitl: {
    http_req_failed: ["rate<0.05"],
    checks: ["rate>0.90"],
  },
};

export function uniqueEmail(prefix) {
  const vu = typeof __VU !== "undefined" ? __VU : 0;
  const iter = typeof __ITER !== "undefined" ? __ITER : 0;
  return `${prefix}-vu${vu}-i${iter}-${Date.now()}@loadtest.local`;
}

export function jsonHeaders(cookieHeader) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}
