# 压测报告：真实 LLM Query（预发档）

**日期**: 2026-08-07  
**分支**: `main`  
**场景**: `07-query-llm`（`pnpm loadtest:llm`）  
**结论**: **PASS** — 冒烟 5×1 与预发 30×2 均通过（checks 100%，60/60 终态 `completed`）

---

## 1. 摘要

| 项 | 内容 |
|----|------|
| 模型 | `qwen3.7-plus`（Anthropic 兼容，阿里云 MaaS） |
| Backend | 宿主机 `langgraph` `:13000`；Docker PG/Redis；`HITL_ENABLED=false` |
| 冒烟 | 5 用户 × 1 次 = 5 执行 — **PASS**（~11.5s） |
| 预发 | 30 用户 × 2 次 = **60** 执行 — **PASS**（~1m46s） |
| 熔断 | checks ≥ 90% — 实际 **100%** |

> 说明：本档验证「小团队/预发同时 query」量级，不是无限阶梯容量探测。HTTP p95 反映轮询 API，不含模型生成时间；模型耗时体现在 `iteration_duration`。

---

## 2. 预发结果（30 × 2）

| 指标 | 值 |
|------|-----|
| 总执行 / 完成 | 60 / 60 |
| checks | 180/180（100%） |
| pool user bound | 60/60 |
| execute 202 | 60/60 |
| execution completed | 60/60 |
| http_req_failed | 0% |
| HTTP 请求数 | 1343 |
| HTTP p95 | 57.2 ms |
| 迭代时长 avg / p95 | 39.6 s / 52.7 s |
| 墙钟 | ~1m46s |
| VU | 30 |

原始 summary：`loadtest/reports/07-query-llm-2026-08-07T09-43-26-352Z-summary.json`（本地 gitignore）

---

## 3. 冒烟结果（5 × 1）

| 指标 | 值 |
|------|-----|
| checks | 15/15（100%） |
| execution completed | 5/5 |
| 迭代时长 avg / max | 7.2 s / 10.8 s |
| 墙钟 | ~11.5s |

---

## 4. 过程备注

1. 首轮失败因 `LLM_API_KEY` 误填为模型名，且 `settings.json` 覆盖 `.env` → 401。  
2. Key 更正并同步 `settings.json` 后复跑通过。  
3. 真 LLM 压测请继续用 `pnpm loadtest:llm`；`pnpm loadtest:all` 仅 mock，避免误烧钱。

---

## 5. 复现

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
# 小跑
$env:LLM_USERS="5"; $env:LLM_ITERS_PER_USER="1"; pnpm loadtest:llm
# 预发默认 30×2
Remove-Item Env:LLM_USERS, Env:LLM_ITERS_PER_USER -ErrorAction SilentlyContinue
pnpm loadtest:llm
```

相关文档：`docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md`、`loadtest/README.md`
