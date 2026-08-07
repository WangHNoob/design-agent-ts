import { check, sleep } from "k6";
import { thresholds } from "../lib/config.js";
import { registerAndLogin, authGet } from "../lib/auth.js";

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || "3m",
  thresholds: thresholds.readApis,
};

const READ_PATHS = [
  "/api/users/me",
  "/api/users/me/assets",
  "/api/settings",
  "/api/settings/status",
  "/api/prompts/",
  "/api/skills/",
  "/api/workflows/",
  "/api/audit/",
  "/api/sessions?limit=20&offset=0",
  "/api/hitl/pending",
  "/api/hitl/checkpoints",
];

export default function () {
  const session = registerAndLogin("s03");
  if (!session) {
    sleep(1);
    return;
  }

  for (const path of READ_PATHS) {
    const res = authGet(path, session.cookie, { name: `read_${path}` });
    check(res, {
      [`${path} ok`]: (r) => r.status === 200 || r.status === 404,
      [`${path} not 5xx`]: (r) => r.status < 500,
    });
  }

  sleep(0.4);
}
