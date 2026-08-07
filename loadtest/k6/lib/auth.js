import http from "k6/http";
import { check } from "k6";
import { BASE_URL, jsonHeaders, uniqueEmail } from "./config.js";

function extractSessionCookie(res) {
  const raw = res.headers["Set-Cookie"] || res.headers["set-cookie"];
  if (!raw) return null;
  const parts = Array.isArray(raw) ? raw : [raw];
  for (const p of parts) {
    const m = String(p).match(/better-auth\.session_token=[^;]+/);
    if (m) return m[0];
  }
  const joined = parts.map((p) => String(p).split(";")[0]).filter(Boolean).join("; ");
  return joined.includes("better-auth.session_token") ? joined : null;
}

export function registerAndLogin(prefix = "lt") {
  const email = uniqueEmail(prefix);
  const password = "LoadTestPass123!";
  const name = `LoadTester ${prefix}`;

  const signUp = http.post(
    `${BASE_URL}/api/auth/sign-up/email`,
    JSON.stringify({ email, password, name }),
    { headers: jsonHeaders(), tags: { name: "auth_sign_up" } },
  );

  const signIn = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders(), tags: { name: "auth_sign_in" } },
  );

  const cookie = extractSessionCookie(signIn) || extractSessionCookie(signUp);
  const ok = check(signIn, {
    "sign-in status 200": (r) => r.status === 200,
    "session cookie present": () => Boolean(cookie),
  });
  if (!ok || !cookie) return null;
  return { cookie, email, password };
}

export function authGet(path, cookie, tags = {}) {
  return http.get(`${BASE_URL}${path}`, {
    headers: jsonHeaders(cookie),
    tags,
  });
}

export function authPost(path, cookie, body, tags = {}, extraHeaders = {}) {
  return http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: { ...jsonHeaders(cookie), ...extraHeaders },
    tags,
  });
}

export function authDelete(path, cookie, tags = {}) {
  return http.del(`${BASE_URL}${path}`, null, {
    headers: jsonHeaders(cookie),
    tags,
  });
}
