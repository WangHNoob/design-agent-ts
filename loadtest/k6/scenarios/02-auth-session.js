import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, thresholds, jsonHeaders } from "../lib/config.js";
import { registerAndLogin, authGet } from "../lib/auth.js";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "3m",
  thresholds: thresholds.auth,
};

export default function () {
  const unauth = http.get(`${BASE_URL}/api/users/me`, {
    headers: jsonHeaders(),
    tags: { name: "me_unauth" },
  });
  check(unauth, { "unauth 401": (r) => r.status === 401 });

  const session = registerAndLogin("s02");
  if (!session) {
    sleep(1);
    return;
  }

  const me = authGet("/api/users/me", session.cookie, { name: "me" });
  check(me, { "me 200": (r) => r.status === 200 });

  const list = authGet("/api/sessions?limit=10&offset=0", session.cookie, { name: "sessions_list" });
  check(list, { "sessions list 200": (r) => r.status === 200 });

  sleep(0.5);
}
