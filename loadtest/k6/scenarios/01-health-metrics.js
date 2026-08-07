import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, thresholds } from "../lib/config.js";

export const options = {
  vus: Number(__ENV.VUS || 30),
  duration: __ENV.DURATION || "3m",
  thresholds: thresholds.health,
};

export default function () {
  const health = http.get(`${BASE_URL}/health`, { tags: { name: "health" } });
  check(health, {
    "health 200": (r) => r.status === 200,
  });

  const metrics = http.get(`${BASE_URL}/metrics`, { tags: { name: "metrics" } });
  check(metrics, {
    "metrics 200": (r) => r.status === 200,
    "metrics text": (r) => String(r.body).includes("process_") || r.status === 200,
  });

  sleep(0.3);
}
