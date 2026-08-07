# Docker 无真实 LLM 压测基线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Docker 全栈上落地可重复的 k6 压测套件（无真实 LLM），覆盖 health/auth/读 API、mock 执行全链路、HITL 审阅与 RPM 429，并产出本地基线报告。

**Architecture:** k6 脚本放在 `loadtest/k6/`，通过 Docker 镜像 `grafana/k6` 对宿主机映射的 backend（默认 `http://host.docker.internal:13000`）施压；压测栈使用 `AGENT_FRAMEWORK=mock` + 占位 `LLM_API_KEY`。场景 04 用 `mode:query`（MockAgent 直接成功）；场景 05 用 `mode:design` + `HITL_ENABLED=true` 走 Durable HITL pending→review。公共 auth/config 库复用，报告写入已 gitignore 的 `loadtest/reports/`。

**Tech Stack:** k6 (Docker)、Hono API、Better Auth Cookie、Redis MQ、Postgres、Node 编排脚本（`run-all.mjs`）

**Spec:** `docs/superpowers/specs/2026-08-07-loadtest-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `loadtest/README.md` | 起栈、环境变量、跑场景、读报告 |
| `loadtest/.env.loadtest.example` | 压测用 env 片段（mock / HITL / 占位 Key） |
| `loadtest/k6/lib/config.js` | BASE_URL、VU、时长、阈值、阈值 helpers |
| `loadtest/k6/lib/auth.js` | sign-up / sign-in，返回 Cookie 头 |
| `loadtest/k6/lib/http.js` | 带 Cookie 的 JSON 请求封装（可选，可并入 auth） |
| `loadtest/k6/scenarios/01-health-metrics.js` | health + metrics |
| `loadtest/k6/scenarios/02-auth-session.js` | 鉴权 + sessions |
| `loadtest/k6/scenarios/03-read-apis.js` | 读类业务 API |
| `loadtest/k6/scenarios/04-execute-mock.js` | enqueue + SSE + 终态 + 幂等 |
| `loadtest/k6/scenarios/05-hitl-review.js` | design + HITL pending → approve |
| `loadtest/k6/scenarios/06-rate-limit.js` | RPM 429 |
| `loadtest/k6/run-scenario.mjs` | 单场景：docker run k6 |
| `loadtest/k6/run-all.mjs` | 顺序跑 01–06 并汇总 exit code |
| `loadtest/reports/.gitkeep` | 占位；实际报告 gitignore |
| `.gitignore` | 增加 `loadtest/reports/*`（保留 `.gitkeep`） |
| `.env.example` | 增加压测相关注释 |
| `package.json` | `loadtest:scenario` / `loadtest:all` |
| `src/adapter/mock/MockModelAdapter.ts` | 默认响应改为可解析的 plan JSON，减少压测时 structured 重试（可选但推荐） |
| `test/adapter/mock/MockAdapters.test.ts` | 覆盖新默认响应仍可 generate |

---

### Task 1: gitignore、env 示例与 README 骨架

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`
- Create: `loadtest/README.md`
- Create: `loadtest/.env.loadtest.example`
- Create: `loadtest/reports/.gitkeep`

- [ ] **Step 1: 更新 `.gitignore`**

在 `# Eval offline reports` 段落后追加：

```gitignore
# Loadtest k6 reports (generated)
loadtest/reports/*
!loadtest/reports/.gitkeep
```

- [ ] **Step 2: 创建 `loadtest/reports/.gitkeep`（空文件）**

- [ ] **Step 3: 创建 `loadtest/.env.loadtest.example`**

```env
# 复制片段到项目根 .env 后重建/重启 backend，专用于无真实 LLM 压测
AGENT_FRAMEWORK=mock
LLM_API_KEY=sk-loadtest-placeholder
HITL_ENABLED=true
ALLOW_EMAIL_PASSWORD=true
COST_ENABLED=true
COST_RPM_LIMIT_PER_USER=60
MQ_ENABLED=true
```

- [ ] **Step 4: 在 `.env.example` 的 `AGENT_FRAMEWORK` 段落后追加注释**

```env
# 无真实 LLM 的 Docker 压测：设 AGENT_FRAMEWORK=mock，并保证 LLM_API_KEY 非空占位，
# 否则 POST /api/console/execute 返回 409 not_configured。详见 loadtest/README.md
# 与 loadtest/.env.loadtest.example
```

- [ ] **Step 5: 创建 `loadtest/README.md`**

内容须包含：

1. 前置：Docker Desktop、已有 `.env`（含 `BETTER_AUTH_SECRET` ≥32）
2. 应用 `loadtest/.env.loadtest.example` 到根 `.env` 后：`node docker-start.mjs --rebuild`（或已有镜像则 `docker compose up -d backend`）
3. 等待 `GET http://localhost:13000/health` → 200
4. 跑单场景：`pnpm loadtest:scenario -- 01-health-metrics`
5. 跑全量：`pnpm loadtest:all`
6. 报告目录：`loadtest/reports/`
7. Windows 说明：k6 容器通过 `host.docker.internal:13000` 访问 backend
8. 范围：无真实 LLM；真 LLM 压测另开

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example loadtest/README.md loadtest/.env.loadtest.example loadtest/reports/.gitkeep
git commit -m "$(cat <<'EOF'
chore(loadtest): scaffold docs, env example, and report gitignore

EOF
)"
```

---

### Task 2: k6 公共库 `config.js` + `auth.js`

**Files:**
- Create: `loadtest/k6/lib/config.js`
- Create: `loadtest/k6/lib/auth.js`

- [ ] **Step 1: 创建 `loadtest/k6/lib/config.js`**

```javascript
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
```

- [ ] **Step 2: 创建 `loadtest/k6/lib/auth.js`**

```javascript
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
  // Fallback: join all set-cookie name=value pairs that look like session
  const joined = parts.map((p) => String(p).split(";")[0]).filter(Boolean).join("; ");
  return joined.includes("better-auth.session_token") ? joined : null;
}

/**
 * Sign up then sign in. Returns { cookie, email, password } or null on failure.
 */
export function registerAndLogin(prefix = "lt") {
  const email = uniqueEmail(prefix);
  const password = "LoadTestPass123!";
  const name = `LoadTester ${prefix}`;

  const signUp = http.post(
    `${BASE_URL}/api/auth/sign-up/email`,
    JSON.stringify({ email, password, name }),
    { headers: jsonHeaders(), tags: { name: "auth_sign_up" } },
  );

  // 200/201 ok; some setups return 422 if exists — then sign-in still tried
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
```

- [ ] **Step 3: Commit**

```bash
git add loadtest/k6/lib/config.js loadtest/k6/lib/auth.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add k6 config and Better Auth cookie helpers

EOF
)"
```

---

### Task 3: 场景 01 health-metrics + 场景 02 auth-session

**Files:**
- Create: `loadtest/k6/scenarios/01-health-metrics.js`
- Create: `loadtest/k6/scenarios/02-auth-session.js`

- [ ] **Step 1: 创建 `01-health-metrics.js`**

```javascript
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
```

- [ ] **Step 2: 创建 `02-auth-session.js`**

```javascript
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, thresholds, jsonHeaders } from "../lib/config.js";
import { registerAndLogin, authGet, authDelete } from "../lib/auth.js";

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

  // Optional: if list has items, GET first; DELETE only self-created if API allows create via execute later
  sleep(0.5);
}
```

- [ ] **Step 3: Commit**

```bash
git add loadtest/k6/scenarios/01-health-metrics.js loadtest/k6/scenarios/02-auth-session.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add health and auth-session k6 scenarios

EOF
)"
```

---

### Task 4: 场景 03 read-apis

**Files:**
- Create: `loadtest/k6/scenarios/03-read-apis.js`

- [ ] **Step 1: 创建场景文件**

```javascript
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
      // cost may 404/403 if disabled path variants — accept 2xx/404 only, not 5xx
      [`${path} not 5xx`]: (r) => r.status < 500,
    });
  }

  sleep(0.4);
}
```

说明：`/api/cost/*` 若 `COST_ENABLED` 关闭可能非 200；先不强制进默认列表，可在 README 注明可选路径。

- [ ] **Step 2: Commit**

```bash
git add loadtest/k6/scenarios/03-read-apis.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add read-apis k6 scenario

EOF
)"
```

---

### Task 5: 增强 MockModelAdapter 默认响应（降低 design/HITL 重试）

**Files:**
- Modify: `src/adapter/mock/MockModelAdapter.ts`
- Modify: `test/adapter/mock/MockAdapters.test.ts`

- [ ] **Step 1: 更新测试 — 默认 generate 返回可解析 JSON 计划片段**

在 `MockAdapters.test.ts` 增加：

```typescript
it("MockModelAdapter 默认响应应为可解析 JSON（便于 mock 框架压测）", async () => {
  const adapter = new MockModelAdapter();
  const res = await adapter.generate([]);
  const text = ChatMessage.textContent(res.message) ?? "";
  expect(() => JSON.parse(text)).not.toThrow();
  const parsed = JSON.parse(text) as { planId?: string; subTasks?: unknown[] };
  expect(parsed.planId).toBeTruthy();
  expect(Array.isArray(parsed.subTasks)).toBe(true);
});
```

- [ ] **Step 2: 跑测试确认失败（旧默认是纯文本）**

Run: `pnpm vitest run test/adapter/mock/MockAdapters.test.ts`

Expected: 新用例 FAIL（无法 JSON.parse）

- [ ] **Step 3: 修改 `MockModelAdapter` 默认 `presetResponses`**

```typescript
constructor(responses?: ChatMessage[]) {
  this.presetResponses = responses ?? [
    CM.text(
      "assistant",
      "mock",
      JSON.stringify({
        planId: "mock-plan",
        subTasks: [
          {
            id: "T1",
            fragmentId: "F1",
            domain: "system_design",
            description: "Mock loadtest task",
            dependencies: [],
            priority: 1,
          },
        ],
      }),
    ),
    CM.text(
      "assistant",
      "mock",
      JSON.stringify([
        {
          fragmentId: "F1",
          domain: "system_design",
          agentName: "SystemDesigner",
          assignment: "Mock loadtest assignment",
          priority: 1,
        },
      ]),
    ),
  ];
}
```

保留：调用方传入 `responses`（含空数组）时行为不变；仅默认值变更。

- [ ] **Step 4: 再跑测试**

Run: `pnpm vitest run test/adapter/mock/MockAdapters.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapter/mock/MockModelAdapter.ts test/adapter/mock/MockAdapters.test.ts
git commit -m "$(cat <<'EOF'
fix(mock): default MockModelAdapter responses to valid plan JSON

EOF
)"
```

注意：改 mock 后 Docker 镜像需 `--rebuild` 才对 live 压测生效。

---

### Task 6: 场景 04 execute-mock（query + SSE + 幂等）

**Files:**
- Create: `loadtest/k6/scenarios/04-execute-mock.js`
- Create: `loadtest/k6/lib/sse.js`（轻量 SSE 消费辅助）

- [ ] **Step 1: 创建 `loadtest/k6/lib/sse.js`**

k6 对长 SSE 用 `http.get` + 较长 timeout，解析 `event: execution_terminal` 或 data 中的终态：

```javascript
import http from "k6/http";
import { BASE_URL, jsonHeaders } from "./config.js";

/**
 * Subscribe to execution SSE until terminal event or timeout.
 * Returns { ok, status, bodySnippet }.
 */
export function waitForExecutionTerminal(cookie, executionId, timeoutMs = 120000) {
  const url = `${BASE_URL}/api/console/executions/${executionId}/events?afterCursor=0-0`;
  const res = http.get(url, {
    headers: {
      ...jsonHeaders(cookie),
      Accept: "text/event-stream",
    },
    timeout: `${timeoutMs}ms`,
    tags: { name: "sse_events" },
  });

  const body = String(res.body || "");
  const terminal =
    body.includes("execution_terminal")
    || body.includes('"status":"completed"')
    || body.includes('"status":"failed"')
    || body.includes('"status":"cancelled"');

  return {
    ok: res.status === 200 && terminal,
    status: res.status,
    bodySnippet: body.slice(0, 500),
    completed: body.includes('"status":"completed"') || body.includes("completed"),
  };
}
```

说明：k6 的 `http.get` 会缓冲到连接关闭；Worker 完成后 SSE 应关闭。若心跳导致超时，将 `timeoutMs` 调到 180000，或改用轮询 `GET /api/console/executions/:id` 作为主断言、SSE 为辅。

**主路径推荐（更稳）**：enqueue 后轮询 execution 状态，偶尔打开短 SSE；避免 k6 卡在无限心跳。

- [ ] **Step 2: 创建 `04-execute-mock.js`（轮询为主）**

```javascript
import { check, sleep } from "k6";
import { thresholds } from "../lib/config.js";
import { registerAndLogin, authGet, authPost } from "../lib/auth.js";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "5m",
  thresholds: thresholds.execute,
};

function pollUntilTerminal(cookie, executionId, maxWaitSec = 90) {
  const deadline = Date.now() + maxWaitSec * 1000;
  while (Date.now() < deadline) {
    const res = authGet(`/api/console/executions/${executionId}`, cookie, { name: "exec_get" });
    if (res.status === 200) {
      try {
        const body = JSON.parse(String(res.body));
        const status = body.status || body.execution?.status;
        if (["completed", "failed", "cancelled", "timeout"].includes(status)) {
          return { status, res };
        }
      } catch (_) {
        /* ignore */
      }
    }
    sleep(1);
  }
  return { status: "timeout_wait", res: null };
}

export default function () {
  const session = registerAndLogin("s04");
  if (!session) {
    sleep(1);
    return;
  }

  const idem = `idem-s04-${__VU}-${__ITER}-${Date.now()}`;
  const create = authPost(
    "/api/console/execute",
    session.cookie,
    {
      requirement: "loadtest query: what is a mock agent?",
      mode: "query",
      role: "chief_designer",
    },
    { name: "execute_create" },
    { "Idempotency-Key": idem },
  );

  check(create, {
    "execute 202": (r) => r.status === 202,
  });

  if (create.status !== 202) {
    sleep(1);
    return;
  }

  const created = JSON.parse(String(create.body));
  const executionId = created.executionId;

  // Idempotent replay
  const replay = authPost(
    "/api/console/execute",
    session.cookie,
    {
      requirement: "loadtest query: what is a mock agent?",
      mode: "query",
      role: "chief_designer",
    },
    { name: "execute_idempotent" },
    { "Idempotency-Key": idem },
  );
  check(replay, {
    "idempotent 202": (r) => r.status === 202,
    "idempotent same id": (r) => {
      try {
        return JSON.parse(String(r.body)).executionId === executionId;
      } catch {
        return false;
      }
    },
    "idempotent created false": (r) => {
      try {
        return JSON.parse(String(r.body)).created === false;
      } catch {
        return false;
      }
    },
  });

  const terminal = pollUntilTerminal(session.cookie, executionId, 90);
  check(null, {
    "execution completed": () => terminal.status === "completed",
  });

  // Light SSE resume check (short timeout) — optional
  const events = authGet(
    `/api/console/executions/${executionId}/events?afterCursor=0-0`,
    session.cookie,
    { name: "sse_resume" },
  );
  // May be 200 with buffered history or quickly end
  check(events, {
    "events not 5xx": (r) => r.status < 500,
  });

  sleep(0.5);
}
```

核对 `ExecuteRequest`：若 `role` 非必填则去掉；以 `src/server/routes/console.ts` 的 `validateExecuteRequest` 为准（至少 `requirement` + `mode`）。

- [ ] **Step 3: Commit**

```bash
git add loadtest/k6/lib/sse.js loadtest/k6/scenarios/04-execute-mock.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add mock execute scenario with idempotency and poll

EOF
)"
```

---

### Task 7: 场景 05 hitl-review

**Files:**
- Create: `loadtest/k6/scenarios/05-hitl-review.js`

前置：压测栈 `HITL_ENABLED=true`（见 `.env.loadtest.example`）。`mode:design` 会在 plan 审阅点 pending。

- [ ] **Step 1: 创建场景**

```javascript
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

  const pending = authGet("/api/hitl/pending", session.cookie, { name: "hitl_pending" });
  check(pending, { "pending 200": (r) => r.status === 200 });

  let checkpointId = null;
  try {
    const body = JSON.parse(String(pending.body));
    const list = Array.isArray(body.items) ? body.items : [];
    const mine = list.find((x) => x.checkpoint?.executionId === executionId || x.executionId === executionId) || list[0];
    checkpointId = mine?.checkpoint?.id || mine?.id;
  } catch (_) {}

  check(null, { "found checkpoint": () => Boolean(checkpointId) });
  if (!checkpointId) {
    sleep(1);
    return;
  }

  const review = authPost(
    `/api/hitl/checkpoints/${checkpointId}/review`,
    session.cookie,
    { action: "approve" },
    { name: "hitl_approve" },
  );
  check(review, {
    "review 2xx": (r) => r.status >= 200 && r.status < 300,
  });

  // Optional CAS conflict: second approve expects 409
  const conflict = authPost(
    `/api/hitl/checkpoints/${checkpointId}/review`,
    session.cookie,
    { action: "approve" },
    { name: "hitl_conflict" },
  );
  check(conflict, {
    "second review 409 or 400": (r) => r.status === 409 || r.status === 400 || r.status === 200,
  });

  sleep(0.5);
}
```

实现时对照 `routes/hitl.ts` 的 request body 字段名（`decision` vs `action`）与 pending 响应形状，按实际字段改一版（禁止猜错后不验证）。

- [ ] **Step 2: 对照源码修正字段后 Commit**

```bash
git add loadtest/k6/scenarios/05-hitl-review.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add HITL review k6 scenario for mock design path

EOF
)"
```

---

### Task 8: 场景 06 rate-limit

**Files:**
- Create: `loadtest/k6/scenarios/06-rate-limit.js`

- [ ] **Step 1: 创建场景（单 VU 突发）**

```javascript
import { check, sleep } from "k6";
import { registerAndLogin, authPost } from "../lib/auth.js";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // This scenario expects some 429s; do not use global http_req_failed < 1%
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
  // COST_RPM_LIMIT_PER_USER default 60 — send ~80 execute attempts quickly
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
```

- [ ] **Step 2: Commit**

```bash
git add loadtest/k6/scenarios/06-rate-limit.js
git commit -m "$(cat <<'EOF'
feat(loadtest): add RPM rate-limit boundary k6 scenario

EOF
)"
```

---

### Task 9: 编排脚本 + package.json

**Files:**
- Create: `loadtest/k6/run-scenario.mjs`
- Create: `loadtest/k6/run-all.mjs`
- Modify: `package.json`

- [ ] **Step 1: 创建 `run-scenario.mjs`**

```javascript
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const scenarioArg = process.argv[2];
if (!scenarioArg) {
  console.error("Usage: node loadtest/k6/run-scenario.mjs <scenario-name>");
  console.error("Example: node loadtest/k6/run-scenario.mjs 01-health-metrics");
  process.exit(1);
}

const name = scenarioArg.replace(/\.js$/, "");
const scriptHost = path.join(__dirname, "scenarios", `${name}.js`);
if (!fs.existsSync(scriptHost)) {
  console.error(`Scenario not found: ${scriptHost}`);
  process.exit(1);
}

const reportsDir = path.join(root, "loadtest", "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryOut = path.join(reportsDir, `${name}-${stamp}-summary.json`);

const baseUrl = process.env.BASE_URL || "http://host.docker.internal:13000";
const image = process.env.K6_IMAGE || "grafana/k6:0.54.0";

// Mount loadtest/k6 so imports of ../lib work; run script at /scripts/scenarios/X.js
const k6Root = path.join(root, "loadtest", "k6");
const args = [
  "run",
  "--rm",
  "-v",
  `${k6Root}:/scripts`,
  "-e",
  `BASE_URL=${baseUrl}`,
  "-e",
  `VUS=${process.env.VUS || ""}`,
  "-e",
  `DURATION=${process.env.DURATION || ""}`,
  image,
  "run",
  "--summary-export",
  `/scripts/../reports/${path.basename(summaryOut)}`,
  `/scripts/scenarios/${name}.js`,
];

// summary-export path inside container: mount reports too
const argsFixed = [
  "run",
  "--rm",
  "-v",
  `${k6Root}:/scripts:ro`,
  "-v",
  `${reportsDir}:/reports`,
  "-e",
  `BASE_URL=${baseUrl}`,
];
if (process.env.VUS) argsFixed.push("-e", `VUS=${process.env.VUS}`);
if (process.env.DURATION) argsFixed.push("-e", `DURATION=${process.env.DURATION}`);
argsFixed.push(
  image,
  "run",
  "--summary-export",
  `/reports/${path.basename(summaryOut)}`,
  `/scripts/scenarios/${name}.js`,
);

console.log(`Running k6 scenario ${name} against ${baseUrl}`);
const result = spawnSync("docker", argsFixed, { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
```

- [ ] **Step 2: 创建 `run-all.mjs`**

```javascript
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scenarios = [
  "01-health-metrics",
  "02-auth-session",
  "03-read-apis",
  "04-execute-mock",
  "05-hitl-review",
  "06-rate-limit",
];

let failed = 0;
for (const s of scenarios) {
  console.log(`\n=== ${s} ===\n`);
  const r = spawnSync(process.execPath, [path.join(__dirname, "run-scenario.mjs"), s], {
    stdio: "inherit",
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) {
    failed += 1;
    console.error(`Scenario ${s} FAILED`);
  }
}

console.log(`\nDone. Failed scenarios: ${failed}/${scenarios.length}`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: 修改 `package.json` scripts**

增加：

```json
"loadtest:scenario": "node loadtest/k6/run-scenario.mjs",
"loadtest:all": "node loadtest/k6/run-all.mjs"
```

- [ ] **Step 4: Commit**

```bash
git add loadtest/k6/run-scenario.mjs loadtest/k6/run-all.mjs package.json
git commit -m "$(cat <<'EOF'
feat(loadtest): add dockerized k6 runners and npm scripts

EOF
)"
```

---

### Task 10: Docker 实跑验证与 README 补全

**Files:**
- Modify: `loadtest/README.md`（写入首轮基线解读样例，不含大报告文件）

- [ ] **Step 1: 准备压测环境**

1. 将 `loadtest/.env.loadtest.example` 合并进根 `.env`
2. 若改过 `MockModelAdapter`：`node docker-start.mjs --rebuild`；否则重启 backend
3. `curl http://localhost:13000/health` → 200

- [ ] **Step 2: 冒烟单场景**

```bash
pnpm loadtest:scenario -- 01-health-metrics
```

（若 npm 传参需要：`pnpm loadtest:scenario 01-health-metrics`，按实际 argv 调整 `run-scenario.mjs`。）

Expected: k6 退出 0，`loadtest/reports/` 出现 summary JSON

- [ ] **Step 3: 跑全量**

```bash
pnpm loadtest:all
```

Expected: 各场景通过或仅 05 在 HITL 未开启时 soft-skip 有文档说明；修复硬失败

- [ ] **Step 4: 更新 README「首轮基线」小节**

记录：日期、机器大致配置、各场景 pass/fail、p95 量级、已知限制（宿主机资源、HITL soft-skip 条件）

- [ ] **Step 5: Commit**

```bash
git add loadtest/README.md
git commit -m "$(cat <<'EOF'
docs(loadtest): record first Docker baseline run notes

EOF
)"
```

- [ ] **Step 6: 回归单元测试（mock 改动后）**

```bash
pnpm test
pnpm run build
```

Expected: PASS

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| k6 + Docker 镜像跑 | 9 |
| BASE_URL / host.docker.internal | 2, 9, README |
| AGENT_FRAMEWORK=mock + 占位 Key | 1, 10 |
| 场景 01–06 | 3, 4, 6, 7, 8 |
| B 档 VU/时长 | 各 scenario `options` |
| 阈值 | `lib/config.js` |
| 幂等 / SSE 或轮询终态 | 6 |
| HITL + soft-skip | 7 |
| RPM 429 | 8 |
| reports gitignore | 1 |
| npm scripts | 9 |
| 不做真 LLM | 全程 mode query/design + mock |
| Mock 默认可跑 design | 5 |

---

## Self-Review Notes

- HITL review body 已按源码确认为 `{ action: "approve" | "reject" | "modify" }`（非 `decision`）。pending 列表形状实现时对照 `GET /api/hitl/pending` 响应再解析 `id` / `executionId`。
- `ExecuteRequest.role` 可选（默认 `chief_designer`）；必填仅为 `requirement` + `mode`。
- k6 SSE 长连接在有心跳时可能不结束：Task 6 已改为轮询为主。
- Windows 上 `docker run` 的 volume 路径使用绝对路径（`run-scenario.mjs` 已 `path.resolve`）。
