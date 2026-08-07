# 压测报告：Query 有界并行合并后（2026-08-07 晚）

**日期**: 2026-08-07  
**分支**: `main` @ `2c5c03c`（已合并单机 Query 有界并行）  
**结论**:

| 套件 | 结果 |
|------|------|
| Mock `pnpm loadtest:all`（01–06） | **6/6 PASS**（checks 100%） |
| 真 LLM `pnpm loadtest:llm` | **未完成对照** — 供应商 **403 Access to model denied** |

---

## 1. 本轮目的

验证合并「单进程有界 inflight + queryMaxTokens」后的回归，并尽量与早间真 LLM 基线对照：

| 早间基线（改造前串行消费） | 迭代 p95 |
|---------------------------|----------|
| 30×2 | ~53s |
| 50×2 | ~1m30s |
| 80×2 | ~3m5s |

目标：在相同档位下观察有界并行（`QUERY_MAX_INFLIGHT=4`）是否缩短排队延迟。

---

## 2. 环境

| 项 | 内容 |
|----|------|
| Backend | 宿主机 `http://localhost:13000`（`dist/` **干净重建**后启动） |
| 配置 | `QUERY_MAX_INFLIGHT=4`、`DESIGN_MAX_INFLIGHT=1`、`QUERY_MAX_TOKENS=1024`、`MQ_ENABLED=true` |
| 基础设施 | Docker Postgres `5433` + Redis `6379` |
| Auth | `ORIGIN=http://localhost:3001` |
| Mock 套件 | `AGENT_FRAMEWORK=mock` + 占位 Key，`HITL_ENABLED=true` |
| LLM 尝试 | `AGENT_FRAMEWORK=langgraph`，模型先后 `qwen3.7-plus` / `qwen3.7-flash`（阿里云 MaaS Anthropic 兼容端点） |

> 注意：改源码后必须 **`Remove-Item -Recurse dist; pnpm run build`**。本轮曾发现增量 `tsc` 未打出 `InflightLimiter`，旧 `dist` 仍在跑串行逻辑。

---

## 3. 真 LLM 压测（受阻）

### 3.1 尝试

1. 干净重建并启动 langgraph backend（inflight=4）。  
2. `LLM_USERS=5` × `LLM_ITERS_PER_USER=1` 冒烟，**三次均失败**（exit 99）。

### 3.2 现象

- HTTP：`execute` 均为 **202**，`http_req_failed=0%`（入队正常）。  
- 终态：5/5 **`failed`**（非超时）。  
- Worker 日志可见有界并行已生效，例如：
  - `inflight query=4/4 ... reason=lane full`
  - `LLM invoke (streaming) with maxTokens=1024 model=qwen3.7-flash`
- 模型错误：
  - `qwen3.7-plus` → **403** `Access to model denied`
  - `qwen3.7-flash` → 同样 **403**（Key 有效长度已恢复为 35；中间曾误用 `ConvertTo-Json` 写坏 `settings.json` 的 Key，已从 `.env` 恢复）

### 3.3 结论（LLM）

**系统侧入队 + 分槽并行工作正常**；本轮无法复现/对比早间延迟，**阻塞在供应商模型权限**，不是应用回归。

恢复模型可用后建议重跑：

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
$env:LLM_EXEC_TIMEOUT_SEC="300"
$env:LLM_USERS="30"; $env:LLM_ITERS_PER_USER="2"; pnpm loadtest:llm
$env:LLM_USERS="50"; $env:LLM_ITERS_PER_USER="2"; pnpm loadtest:llm
```

并与早间报告 `docs/superpowers/reports/2026-08-07-loadtest-llm-query-report.md` 对照迭代 p95。

---

## 4. Mock 全量（01–06）— PASS

**命令**: `pnpm loadtest:all`  
**汇总**: `Failed scenarios: 0/6`  
**原始 summary**: `loadtest/reports/*-2026-08-07T11-59*` ～ `T12-03*`

| 场景 | 结果 | VU | 迭代 | HTTP 请求 | HTTP p95 | checks |
|------|------|----|------|-----------|----------|--------|
| 01 health-metrics | PASS | 3 | 441 | 882 | 5.4 ms | 1323/1323 |
| 02 auth-session | PASS | 3 | 204 | 1020 | 84.5 ms | 1020/1020 |
| 03 read-apis | PASS | 3 | 231 | 3003 | 79.5 ms | 5544/5544 |
| 04 execute-mock | PASS | 3 | 66 | 462 | 423.3 ms | 528/528 |
| 05 hitl-review | PASS | 3 | 28 | 296 | 581.2 ms | 168/168 |
| 06 rate-limit | PASS | 1 | 1 | 82 | ~1.1 s* | 4/4 |

\* 06 场景故意打满 RPM，p95 含大量 429 路径，属预期。

**解读**:

- 合并有界并行后，mock 执行/HITL/鉴权/限流链路 **无回归**。  
- 04 的 HTTP p95（轮询 + 入队）约 **423 ms**，与「API 很快、慢在模型」的早间结论一致。  
- Mock 不能替代真 LLM 的 50s SLO 验证。

---

## 5. 与改造的关系

| 能力 | 本轮证据 |
|------|----------|
| MQ 有界并发 + Worker 分槽 | LLM 冒烟日志出现 `query=4/4` / `lane full` |
| `QUERY_MAX_TOKENS=1024` | 日志 `maxTokens=1024` |
| 忙时不拒入队 | 5 路均 202；槽满 defer 而非 429 |
| 外围 API 回归 | mock 01–06 全绿 |

---

## 6. 风险与后续

1. **优先**：修复阿里云 MaaS 模型权限（或换回已开通模型），再跑 `30×2` / `50×2` 真 LLM 对照报告。  
2. 部署前务必 **干净重建 `dist/`**，避免增量编译漏文件。  
3. 勿用 PowerShell `ConvertTo-Json` 整文件回写 `settings.json`（易损坏 Key）；只改必要字段。  
4. `settings.json` 的 `modelName` 会覆盖 `.env` 的 `LLM_MODEL`，两边需一致且账号有权访问。

---

## 7. 复现

```powershell
# 干净构建
Remove-Item -Recurse -Force dist
pnpm run build

# Mock 回归
$env:AGENT_FRAMEWORK="mock"
$env:LLM_API_KEY="sk-loadtest-placeholder"
$env:HITL_ENABLED="true"
$env:PORT="13000"
$env:QUERY_MAX_INFLIGHT="4"
# … Postgres/Redis/MQ 等同上文
node --env-file=.env dist/server/main.js

$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
pnpm loadtest:all
```
