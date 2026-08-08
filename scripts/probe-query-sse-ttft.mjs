/**
 * One-shot SSE probe: measure time-to-first-chunk vs complete for query mode.
 * Usage: node scripts/probe-query-sse-ttft.mjs [baseUrl] [requirement]
 */
const BASE = process.argv[2] || "http://localhost:13000";
const ORIGIN = process.env.ORIGIN || "http://localhost:3001";
const REQUIREMENT =
  process.argv[3] ||
  "用一句话解释 RPG 战斗里的伤害公式是什么？";

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const p of raw) {
    const m = String(p).match(/better-auth\.session_token=[^;]+/);
    if (m) return m[0];
  }
  const single = res.headers.get("set-cookie");
  if (!single) return null;
  const m = single.match(/better-auth\.session_token=[^;]+/);
  return m ? m[0] : null;
}

async function registerAndLogin() {
  const email = `ttft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "LoadTestPass123!";
  const headers = {
    "Content-Type": "application/json",
    Origin: ORIGIN,
  };
  await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, name: "TTFT Probe" }),
  });
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  const cookie = extractCookie(signIn);
  if (!cookie || !signIn.ok) {
    throw new Error(`auth failed status=${signIn.status} body=${await signIn.text()}`);
  }
  return cookie;
}

async function probe(cookie) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/console/execute/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      Cookie: cookie,
      "Idempotency-Key": `ttft-${Date.now()}`,
    },
    body: JSON.stringify({ requirement: REQUIREMENT, mode: "query" }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream open failed status=${res.status} body=${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events = [];
  let firstChunkAt = null;
  let completeAt = null;
  let executionId = null;
  let textLen = 0;
  let chunkCount = 0;
  let faqHit = null;
  let error = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const block of parts) {
      const lines = block.split("\n");
      let eventName = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const type = parsed.type || eventName;
      const at = Date.now() - t0;
      events.push({ at, type, data: parsed.data ?? parsed });
      if (parsed.executionId) executionId = parsed.executionId;
      if (type === "chunk") {
        chunkCount += 1;
        const text = parsed.data?.text ?? "";
        textLen += String(text).length;
        if (firstChunkAt == null) firstChunkAt = at;
      }
      if (type === "faq_hit") faqHit = parsed.data ?? parsed;
      if (type === "complete" || type === "error" || type === "cancelled") {
        completeAt = at;
        if (type === "error") error = parsed.data ?? parsed;
        // keep reading briefly for trailing events, but break soon
        break;
      }
    }
    if (completeAt != null) break;
  }

  return {
    base: BASE,
    requirement: REQUIREMENT,
    executionId,
    ttftMs: firstChunkAt,
    completeMs: completeAt,
    gapCompleteMinusTtftMs:
      firstChunkAt != null && completeAt != null ? completeAt - firstChunkAt : null,
    chunkCount,
    textLen,
    faqHit,
    error,
    eventTypes: events.map((e) => `${e.at}ms:${e.type}`),
    sampleChunks: events
      .filter((e) => e.type === "chunk")
      .slice(0, 5)
      .map((e) => ({ at: e.at, text: String(e.data?.text ?? "").slice(0, 40) })),
  };
}

const cookie = await registerAndLogin();
const result = await probe(cookie);
console.log(JSON.stringify(result, null, 2));
if (result.error) process.exitCode = 2;
else if (result.ttftMs == null) process.exitCode = 3;
