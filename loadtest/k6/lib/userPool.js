import http from "k6/http";
import { BASE_URL, jsonHeaders, uniqueEmail } from "./config.js";

const PASSWORD = "LoadTestPass123!";

/**
 * Register one user and return session cookie. No k6 checks (for setup).
 * @returns {{ cookie: string, email: string, password: string } | null}
 */
export function registerUserQuiet(prefix, index) {
  const email = `${prefix}-pool${index}-${Date.now()}@loadtest.local`;
  const name = `LLM Load ${prefix} ${index}`;

  const signUp = http.post(
    `${BASE_URL}/api/auth/sign-up/email`,
    JSON.stringify({ email, password: PASSWORD, name }),
    { headers: jsonHeaders(), tags: { name: "llm_pool_sign_up" } },
  );

  const signIn = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: jsonHeaders(), tags: { name: "llm_pool_sign_in" } },
  );

  const cookie = extractSessionCookie(signIn) || extractSessionCookie(signUp);
  if (!cookie || signIn.status !== 200) {
    return null;
  }
  return { cookie, email, password: PASSWORD };
}

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

/**
 * Create a pool of users for multi-tenant load. Returns array of sessions.
 */
export function createUserPool(count, prefix = "llm") {
  const users = [];
  for (let i = 1; i <= count; i++) {
    const u = registerUserQuiet(prefix, i);
    if (!u) {
      throw new Error(`userPool: failed to register user index=${i}`);
    }
    users.push(u);
  }
  return users;
}

/**
 * Bind VU (1-based) to a pool user.
 */
export function getUserForVu(users, vu) {
  if (!users || users.length === 0) return null;
  const idx = (Math.max(1, vu) - 1) % users.length;
  return users[idx];
}

// re-export for callers that want unique emails elsewhere
export { uniqueEmail };
