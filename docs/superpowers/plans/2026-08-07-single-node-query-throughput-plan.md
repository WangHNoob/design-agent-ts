# 单机 Query 有界并行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单进程对 Redis 执行队列做有界并行消费（query/design 分槽），并接上 query `maxTokens` 快路径，使 2G 单机下几十人短 query 多数能逼近 p95≤50s，忙时只排队、不中途杀 LLM、不默认过载 429。

**Architecture:** 在 `adapter/redis` 消费循环内对 handler **并发派发**并受 `maxInflight` 约束；在 `ExecutionWorker` 用 `InflightLimiter` 按 `mode` 占用 query/design 槽，槽满则 **defer 重入队且不增加 retryCount**。配置经 `FrameworkConfig` / `loadConfig` / `.env.example` 注入。不引入 Actor、`worker_threads`、过载拒绝或 running abort。

**Tech Stack:** TypeScript、Vitest、现有 Redis Streams MQ、Hono bootstrap、Director QueryAgent。

**Spec:** `docs/superpowers/specs/2026-08-07-single-node-query-throughput-design.md`

---

## File map

| 文件 | 职责 |
|------|------|
| `src/core/execution/InflightLimiter.ts` | query/design 分槽 acquire/tryAcquire/release |
| `src/port/queue/MessageQueuePort.ts` | `MessageResult.defer`；可选 MQ options 类型若放 port 注释即可 |
| `src/adapter/redis/RedisMessageQueueAdapter.ts` | `maxInflight` + 并发 `processEntry`；defer 重入队不增 retry |
| `src/server/worker/ExecutionWorker.ts` | payload.mode；分槽；defer |
| `src/server/routes/console.ts` / `hitl.ts` / `bootstrap.ts` | publish 带 `mode`；注入 limiter 与 MQ maxInflight |
| `src/config/FrameworkConfig.ts` / `loadConfig.ts` / `validateConfig.ts` / `.env.example` | 新配置项 |
| `src/core/agent/director/DirectorAgent.ts` | QueryAgent `maxTokens` |
| `test/core/execution/InflightLimiter.test.ts` | 分槽单测 |
| `test/adapter/redis/RedisMessageQueueAdapter.test.ts` | 并发与 defer |
| `test/server/worker/ExecutionWorker.inflight.test.ts` | Worker defer（可用轻量 fake） |
| `docs/superpowers/specs/...` 已存在；可选 `DEPLOY.md` 短节 2G | 运维约定 |

---

### Task 1: InflightLimiter（core）

**Files:**
- Create: `src/core/execution/InflightLimiter.ts`
- Create: `test/core/execution/InflightLimiter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "vitest";
import { InflightLimiter } from "../../../src/core/execution/InflightLimiter.js";

describe("InflightLimiter", () => {
  test("tryAcquire respects per-lane caps and release frees a slot", () => {
    const limiter = new InflightLimiter({ query: 2, design: 1 });
    expect(limiter.tryAcquire("query")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(false);
    expect(limiter.tryAcquire("design")).toBe(true);
    expect(limiter.tryAcquire("design")).toBe(false);
    expect(limiter.counts()).toEqual({ query: 2, design: 1 });
    limiter.release("query");
    expect(limiter.tryAcquire("query")).toBe(true);
  });

  test("table lane uses query cap", () => {
    const limiter = new InflightLimiter({ query: 1, design: 1 });
    expect(limiter.tryAcquire("table")).toBe(true);
    expect(limiter.tryAcquire("query")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/core/execution/InflightLimiter.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```typescript
export type InflightLane = "query" | "design" | "table";

export interface InflightLimiterOptions {
  readonly query: number;
  readonly design: number;
}

export class InflightLimiter {
  private readonly max: { query: number; design: number };
  private readonly used = { query: 0, design: 0 };

  constructor(options: InflightLimiterOptions) {
    this.max = {
      query: Math.max(1, Math.trunc(options.query)),
      design: Math.max(1, Math.trunc(options.design)),
    };
  }

  private resolve(lane: InflightLane): "query" | "design" {
    return lane === "design" ? "design" : "query";
  }

  tryAcquire(lane: InflightLane): boolean {
    const key = this.resolve(lane);
    if (this.used[key] >= this.max[key]) return false;
    this.used[key] += 1;
    return true;
  }

  release(lane: InflightLane): void {
    const key = this.resolve(lane);
    if (this.used[key] <= 0) return;
    this.used[key] -= 1;
  }

  counts(): Readonly<{ query: number; design: number }> {
    return { query: this.used.query, design: this.used.design };
  }

  maxCounts(): Readonly<{ query: number; design: number }> {
    return { ...this.max };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/core/execution/InflightLimiter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/execution/InflightLimiter.ts test/core/execution/InflightLimiter.test.ts
git commit -m "$(cat <<'EOF'
feat: add InflightLimiter for query/design execution slots

EOF
)"
```

---

### Task 2: MessageResult.defer + MQ 有界并发派发

**Files:**
- Modify: `src/port/queue/MessageQueuePort.ts`
- Modify: `src/adapter/redis/RedisMessageQueueAdapter.ts`
- Modify: `test/adapter/redis/RedisMessageQueueAdapter.test.ts`

- [ ] **Step 1: Extend port**

In `MessageResult`:

```typescript
export interface MessageResult {
  readonly success: boolean;
  readonly error?: string;
  readonly retry?: boolean;
  /**
   * Re-queue without incrementing retryCount (back-pressure / lane full).
   * Ignored when success is true.
   */
  readonly defer?: boolean;
}
```

- [ ] **Step 2: Write failing concurrency + defer tests**

Append to `RedisMessageQueueAdapter.test.ts`:

```typescript
test("processes multiple messages concurrently up to maxInflight", async () => {
  const client = new FakeRedisClient();
  const adapter = new RedisMessageQueueAdapter(
    "redis://unused",
    { randomUUID: () => "instance-id" },
    { client, blockMs: 5, visibilityTimeoutMs: 10_000, maxRetries: 2, maxInflight: 3 },
  );
  let started = 0;
  let maxStarted = 0;
  const release!: Array<() => void> = [];
  await adapter.subscribe("parallel", async () => {
    started += 1;
    maxStarted = Math.max(maxStarted, started);
    await new Promise<void>((resolve) => {
      release.push(() => {
        started -= 1;
        resolve();
      });
    });
    return { success: true };
  });
  await adapter.publish("parallel", 1);
  await adapter.publish("parallel", 2);
  await adapter.publish("parallel", 3);
  await adapter.publish("parallel", 4);
  await adapter.start();
  await waitFor(() => maxStarted >= 3, 1000);
  expect(maxStarted).toBe(3);
  while (release.length) release.shift()!();
  await waitFor(() => client.pending.get("mq:parallel")?.size === 0, 1000);
  await adapter.stop();
});

test("defer republishes without incrementing retryCount", async () => {
  const client = new FakeRedisClient();
  const adapter = createAdapter(client, { maxRetries: 2 });
  // After implementing: pass maxInflight: 1 on createAdapter options
  let hits = 0;
  await adapter.subscribe("defer-q", async (message) => {
    hits += 1;
    if (hits === 1) return { success: false, defer: true, error: "lane full" };
    return { success: true };
  });
  const published = await adapter.publish("defer-q", { n: 1 });
  await adapter.start();
  await waitFor(() => hits >= 2, 1000);
  await adapter.stop();
  expect(hits).toBeGreaterThanOrEqual(2);
  // First re-delivery must still be retryCount 0
  // (assert via recording retryCounts in handler if needed)
});
```

Fix the `release!:` typo when implementing — use `const release: Array<() => void> = []`.

Extend `createAdapter` options with `maxInflight?: number` and pass through.

- [ ] **Step 3: Run tests — expect FAIL**

Run: `pnpm exec vitest run test/adapter/redis/RedisMessageQueueAdapter.test.ts`

Expected: FAIL on new tests (no maxInflight / serial await / no defer)

- [ ] **Step 4: Implement adapter changes**

1. `RedisMessageQueueOptions` 增加 `maxInflight?: number`（默认 `1` 保持旧行为，bootstrap 再注入更大值）。
2. `consumeLoop`：
   - 维护 `private readonly runningHandlers = new Set<Promise<void>>()`；
   - 当 `runningHandlers.size >= maxInflight` 时不要 `XREADGROUP` 新消息，短 `pause`；
   - 对可读 entry：`const p = this.processEntry(...).finally(() => this.runningHandlers.delete(p)); this.runningHandlers.add(p);` **不要**在派发后 `await p`（可 await 仅当需要背压时等 `Promise.race` / size 下降）；
   - `stop()`：`this.running = false` 后 `await Promise.all([...this.runningHandlers])`。
3. `handleFailure` / `processEntry`：若 `result.defer === true`，则：

```typescript
const deferred: QueueMessage = { ...message /* retryCount unchanged */ };
await this.appendMessage(streamKey, deferred);
await this.ackAndDelete(streamKey, entryId);
return;
```

不要走增加 `retryCount` 的 retry 分支。

4. 保留心跳、`inFlight` entry 去重；并发下同一 entry 仍靠 `inFlight` Set。

- [ ] **Step 5: Run tests — expect PASS**

Run: `pnpm exec vitest run test/adapter/redis/RedisMessageQueueAdapter.test.ts`

Expected: 全部 PASS（含原有 retry/DLQ）

- [ ] **Step 6: Commit**

```bash
git add src/port/queue/MessageQueuePort.ts src/adapter/redis/RedisMessageQueueAdapter.ts test/adapter/redis/RedisMessageQueueAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat: bounded concurrent MQ dispatch with defer requeue

EOF
)"
```

---

### Task 3: 配置三处同步

**Files:**
- Modify: `src/config/FrameworkConfig.ts`
- Modify: `src/config/loadConfig.ts`
- Modify: `src/config/validateConfig.ts`
- Modify: `.env.example`

- [ ] **Step 1: Types on `execution` block**

```typescript
execution: {
  taskTimeoutMs: number;
  pollIntervalMs: number;
  eventMaxLength: number;
  sseHeartbeatMs: number;
  /** Max concurrent query/table executions per process. Default 4. */
  queryMaxInflight: number;
  /** Max concurrent design executions per process. Default 1. */
  designMaxInflight: number;
};
```

Add under `limits`:

```typescript
/** Cap completion tokens for QueryAgent. Default 1024. */
queryMaxTokens: number;
```

- [ ] **Step 2: loadConfig**

```typescript
queryMaxInflight: Number(process.env.QUERY_MAX_INFLIGHT ?? 4),
designMaxInflight: Number(process.env.DESIGN_MAX_INFLIGHT ?? 1),
// in limits:
queryMaxTokens: Number(process.env.QUERY_MAX_TOKENS ?? 1024),
```

- [ ] **Step 3: validateConfig**

- `queryMaxInflight` / `designMaxInflight`：正整数；`queryMaxInflight` 建议上限校验 ≤ 32（防误配）。
- `queryMaxTokens`：正整数。

- [ ] **Step 4: `.env.example`**

```bash
# Single-process execution parallelism (2G: keep QUERY_MAX_INFLIGHT at 4–8; do not scale multiple backend processes)
QUERY_MAX_INFLIGHT=4
DESIGN_MAX_INFLIGHT=1
# Query fast-path completion token cap
QUERY_MAX_TOKENS=1024
# For 2G hosts, consider MAX_CONCURRENT_PER_USER=2
```

- [ ] **Step 5: Commit**

```bash
git add src/config/FrameworkConfig.ts src/config/loadConfig.ts src/config/validateConfig.ts .env.example
git commit -m "$(cat <<'EOF'
feat: add query/design inflight and queryMaxTokens config

EOF
)"
```

---

### Task 4: ExecutionWorker 分槽 + publish mode

**Files:**
- Modify: `src/server/worker/ExecutionWorker.ts`
- Modify: `src/server/routes/console.ts`
- Modify: `src/server/routes/hitl.ts`
- Modify: `src/server/bootstrap.ts`（及任何 `EXECUTION_QUEUE` publish）
- Create: `test/server/worker/ExecutionWorker.inflight.test.ts`

- [ ] **Step 1: Extend payload**

```typescript
export interface ExecutionQueuePayload {
  readonly executionId: string;
  readonly userId: string;
  /** Used for lane limiting; if missing, worker loads execution.mode */
  readonly mode?: "design" | "query" | "table";
}
```

- [ ] **Step 2: Worker deps**

```typescript
inflightLimiter: InflightLimiter;
```

In `runExecution`，在 `acquireConcurrencySlot` **之前或之后**（建议在 tenant slot 成功之后、真正跑 Director 之前）：

```typescript
const mode = (payload.mode ?? /* from execution payload/entity */ "query") as InflightLane;
// Prefer execution record mode if available for truth:
const lane = (execution /* has mode field */) as ...
if (!this.deps.inflightLimiter.tryAcquire(lane)) {
  await service.requeue(execution.id, new Error("Execution inflight lane full"));
  // session status stays queued — mirror tenant-limit path
  return { success: false, defer: true, error: "Execution inflight lane full" };
}
try {
  // existing run body
} finally {
  this.deps.inflightLimiter.release(lane);
  // existing tenant release + activeExecutions cleanup must remain correct
}
```

确认 `execution` 实体上已有 `mode`（从 repository.get）；**以 DB mode 为准**，payload.mode 仅作优化。`table` → query 槽（limiter 已处理）。

- [ ] **Step 3: Publish sites**

`console.ts` createExecution publish:

```typescript
await dependencies.queue.publish(
  EXECUTION_QUEUE,
  { executionId: result.entity.id, userId: tenant.userId, mode: body.mode },
  { userId: tenant.userId, maxRetries: dependencies.maxRetries },
);
```

`hitl.ts` / `bootstrap.ts` resume 路径：从 execution 读 `mode` 写入 payload。

- [ ] **Step 4: bootstrap 组装**

创建 MQ adapter 时：

```typescript
maxInflight: config.execution.queryMaxInflight + config.execution.designMaxInflight,
```

创建 Worker：

```typescript
inflightLimiter: new InflightLimiter({
  query: config.execution.queryMaxInflight,
  design: config.execution.designMaxInflight,
}),
```

找到 `new RedisMessageQueueAdapter(...)` 的位置一并传入 `maxInflight`。

- [ ] **Step 5: Worker unit test（fake limiter + stub deps）**

最小测：当 `tryAcquire` 为 false 时，`handleMessage` 返回 `defer: true` 且不进入 director（mock director 调用次数 0）。若现有 Worker 测试基座难抽，可用手工构造 deps（内存 repo + fake queue 不必须）。优先保证行为测过；若成本过高，用 InflightLimiter + 抽出纯函数 `resolveLane(mode)` 测 + 集成靠 MQ 测——但本任务应至少有一个 Worker 级测。

- [ ] **Step 6: Run related tests**

Run: `pnpm exec vitest run test/core/execution/InflightLimiter.test.ts test/adapter/redis/RedisMessageQueueAdapter.test.ts test/server/worker/`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server/worker/ExecutionWorker.ts src/server/routes/console.ts src/server/routes/hitl.ts src/server/bootstrap.ts test/server/worker/ExecutionWorker.inflight.test.ts
git commit -m "$(cat <<'EOF'
feat: gate executions with query/design inflight lanes

EOF
)"
```

---

### Task 5: Query 快路径 maxTokens

**Files:**
- Modify: `src/core/agent/director/DirectorAgent.ts`
- Modify: `src/server/bootstrap.ts`（`DirectorDeps.limits` 注入 `queryMaxTokens`）
- Test: 若有 Director 构造测则扩展；否则加小测断言 descriptor，或在现有 director 测中 stub

- [ ] **Step 1: Extend Director limits type**

在 `DirectorDeps.limits`（或等价）增加 `queryMaxTokens?: number`。

- [ ] **Step 2: createQueryAgent / createQueryAgentWithHooks**

```typescript
const queryDescriptor: AgentDescriptor = {
  name: "QueryAgent",
  systemPrompt: querySystemPrompt ?? this.querySystemPrompt,
  maxIterations: this.deps.limits?.queryAgentMaxIterations ?? 10,
  maxTokens: this.deps.limits?.queryMaxTokens,
  toolNames: [ /* unchanged */ ],
  options: {},
};
```

`LangGraphAgentAdapter` 已把 `descriptor.maxTokens` 传给 stream options——无需改 adapter。

- [ ] **Step 3: bootstrap 传入**

```typescript
limits: {
  ...,
  queryAgentMaxIterations: config.limits.queryAgentMaxIterations,
  queryMaxTokens: config.limits.queryMaxTokens,
},
```

（按现有 `DirectorAgent` 构造实参结构对齐。）

- [ ] **Step 4: Commit**

```bash
git add src/core/agent/director/DirectorAgent.ts src/server/bootstrap.ts
git commit -m "$(cat <<'EOF'
feat: cap QueryAgent completion tokens via queryMaxTokens

EOF
)"
```

---

### Task 6: 观测日志 + 2G 运维说明

**Files:**
- Modify: `src/server/worker/ExecutionWorker.ts`（或 bootstrap）
- Modify: `DEPLOY.md`（若过长则只加一小节）或 `docs/superpowers/specs/2026-08-07-single-node-query-throughput-design.md` 已含配比——在 `DEPLOY.md` 加「单机 2G」短节即可

- [ ] **Step 1: 日志**

在 acquire/release 时（debug 或 info，避免刷屏可用周期性）：

```typescript
console.log(
  `[ExecutionWorker] inflight query=${counts.query}/${max.query} design=${counts.design}/${max.design} execution=${execution.id} mode=${lane}`,
);
```

仅在 acquire 成功与 defer 时各打一条即可。

- [ ] **Step 2: DEPLOY.md 短节**

内容要点：

- 单进程；`NODE_OPTIONS=--max-old-space-size=768`
- `QUERY_MAX_INFLIGHT=4` 起步；不要 `scale backend`
- Redis/PG 内存建议
- 忙时排队、不中途杀；50s 为 SLO 非硬杀

- [ ] **Step 3: Commit**

```bash
git add src/server/worker/ExecutionWorker.ts DEPLOY.md
git commit -m "$(cat <<'EOF'
docs: document 2G single-node query parallelism ops

EOF
)"
```

---

### Task 7: 全量验证

- [x] **Step 1: 架构与单测**

Run:

```bash
pnpm lint
pnpm test
pnpm run build
```

Expected: 全部通过。  
实际：`pnpm test`（432 passed / 5 skipped）与 `pnpm run build` 通过；`pnpm lint` 失败项与 main 既有问题一致，非本分支引入。

- [ ] **Step 2: 手动并发冒烟（可选，有 Redis 时）**

- 配置 `QUERY_MAX_INFLIGHT=2`，快速连续入队 4 个 mock/短 query（或现有 loadtest mock execute）。
- 日志应出现同时 inflight≈2，且任务最终均 `completed`（或 mock 终态），无因本方案产生的批量 `timed_out`。

- [x] **Step 3: 更新 spec 状态行**

将 `docs/superpowers/specs/2026-08-07-single-node-query-throughput-design.md` 状态改为「实现中/已落地（按 commit）」。

- [x] **Step 4: Final commit if needed**

```bash
git add docs/superpowers/specs/2026-08-07-single-node-query-throughput-design.md
git commit -m "$(cat <<'EOF'
docs: mark query throughput spec implemented

EOF
)"
```

---

## Spec coverage check

| Spec 项 | Task |
|---------|------|
| 单进程有界 inflight | 2, 4 |
| query/design 分槽 | 1, 4 |
| 忙时排队 / defer 不增 retry | 2, 4 |
| 不默认 429 / 不 abort running | 全计划未引入 |
| QUERY_* / DESIGN_* 配置三处 | 3 |
| queryMaxTokens 快路径 | 5 |
| 2G 运维约定 | 6 |
| 测试与验收 | 1, 2, 4, 7 |
| P3 未开工放弃 / BYOK / 多进程 | 不做 |

## 风险备注（实现时遵守）

- **队头阻塞**：同队列 design 占满时 defer 重入队尾，避免饿死 query；defer 路径必须 **append+ack**，不能只 retry++。
- **stop() 排空**：并发 handler 必须在 stop 时 await 完。
- **默认 maxInflight=1**：adapter 默认保持串行，避免其它测试/调用方行为突变；仅 bootstrap 打开并行。
