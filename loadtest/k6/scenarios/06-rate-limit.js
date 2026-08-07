import { check, sleep } from "k6";
import { registerAndLogin, authPost } from "../lib/auth.js";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate>0.99"],
  },
};

export default function () {
  const session = registerAndLogin("s06");
  if (!session) {
    check(null, { "login for rate limit": () => false });
    return;
  }

  let saw429 = false;
  let saw5xx = false;
  for (let i = 0; i < 80; i++) {
    const res = authPost(
      "/api/console/execute",
      session.cookie,
      {
        requirement: `rate limit probe ${i}`,
        mode: "query",
      },
      { name: "rpm_probe" },
      { "Idempotency-Key": `rpm-${Date.now()}-${i}` },
    );
    if (res.status === 429) saw429 = true;
    if (res.status >= 500) saw5xx = true;
  }

  check(null, {
    "saw 429": () => saw429,
    "no 5xx storm": () => !saw5xx,
  });

  sleep(1);
}
