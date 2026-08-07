# 压测报告：真实 LLM Query（预发 → 中等团队）

**日期**: 2026-08-07  
**分支**: `main`  
**场景**: `07-query-llm`（`pnpm loadtest:llm`）  
**结论**: **在「中等规模团队同时 query」量级下可满足压力**（本环境实测至 **80 并发用户**，checks 100%）

---

## 1. 对「中等规模团队」的判断

| 档位 | 并发用户 | 总真 LLM 执行 | 结果 | 墙钟 |
|------|----------|---------------|------|------|
| 冒烟 | 5 × 1 | 5 | PASS | ~12s |
| 小团队/预发 | 30 × 2 | 60 | PASS | ~1m46s |
| **中等团队** | **50 × 2** | **100** | **PASS** | **~3m08s** |
| **中等偏上** | **80 × 2** | **160** | **PASS** | **~5m52s** |

**结论（有边界）：**

- 在当前栈（本机 langgraph + Docker PG/Redis + `qwen3.7-plus`、`MAX_CONCURRENT_PER_USER=3`）下，**约 50–80 人同时各自跑短 query**，系统能稳定入队并全部 `completed`，无 HTTP 失败、无 checks 熔断。
- 这覆盖的是 **「中等团队同时使用 query」**，不是「全员同时跑 design 长流程」，也不是无限冲高找拐点。
- 单次体验会随并发变慢：80 VU 时迭代 p95 ≈ **3m5s**（含排队 + 模型），50 VU 时 p95 ≈ **1m30s**；API 轮询本身仍很快（HTTP p95 &lt; 60ms）。

---

## 2. 中等档明细

### 50 × 2（100 次）

| 指标 | 值 |
|------|-----|
| checks | 300/300（100%） |
| execute 202 / completed | 100/100 |
| http_req_failed | 0% |
| HTTP p95 | 40.4 ms |
| 迭代 avg / p95 | 1m8s / 1m30s |
| 墙钟 | ~3m08s |

### 80 × 2（160 次）

| 指标 | 值 |
|------|-----|
| checks | 480/480（100%） |
| execute 202 / completed | 160/160 |
| http_req_failed | 0% |
| HTTP 请求数 | 10840 |
| HTTP p95 | 21.1 ms |
| 迭代 avg / p95 | 2m11s / 3m5s |
| 墙钟 | ~5m52s |

### 对照：30 × 2（此前预发）

| 指标 | 值 |
|------|-----|
| completed | 60/60 |
| 迭代 p95 | ~53s |
| 墙钟 | ~1m46s |

---

## 3. 风险与适用边界

| 点 | 说明 |
|----|------|
| 场景 | 仅 `mode=query`；design 更重，不能直接外推 |
| 供应商 | 依赖阿里云 MaaS 限流与稳定性；本轮未见 401/限流导致失败 |
| 单用户槽 | `MAX_CONCURRENT_PER_USER=3`；本场景每用户仅 2 次，未打满单用户槽 |
| 体验 SLA | 高并发下「等结果」变长；若产品要求 query &lt;30s，需降并发或加容量/更快模型 |
| 环境 | 本机单 backend，非多副本生产拓扑 |

---

## 4. 复现

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
$env:LLM_EXEC_TIMEOUT_SEC="300"

$env:LLM_USERS="50"; $env:LLM_ITERS_PER_USER="2"; pnpm loadtest:llm
$env:LLM_USERS="80"; $env:LLM_ITERS_PER_USER="2"; pnpm loadtest:llm
```

相关：`loadtest/README.md`、`docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md`
