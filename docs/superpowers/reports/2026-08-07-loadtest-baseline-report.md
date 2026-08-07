# 压测报告：无真实 LLM Docker 基线

**日期**: 2026-08-07  
**分支**: `main`（已合并 `feat/loadtest-baseline`）  
**结论**: **6/6 场景通过**（checks 成功率均为 100%）

---

## 1. 摘要

| 项 | 内容 |
|----|------|
| 目标 | 建立可重复回归基线；覆盖外围 API + mock 全链路，**不含真实 LLM** |
| 工具 | k6 2.1.0（本机 Windows） |
| 被测服务 | 宿主机 mock backend `http://localhost:13000` |
| 基础设施 | Docker Postgres（宿主机 `5433`）+ Redis（`6379`） |
| Agent | `AGENT_FRAMEWORK=mock` + 占位 `LLM_API_KEY`，`HITL_ENABLED=true` |
| Auth | Better Auth Cookie；请求带 `ORIGIN=http://localhost:3001`（与 `TRUSTED_ORIGINS` 一致） |
| 总评 | 健康检查、鉴权、读 API、幂等入队与终态、HITL 审阅 CAS、RPM 429 边界均符合预期 |

> 说明：本轮为冒烟/短时长验证（非完整 B 档 20–50 VU × 3–5min 全时长）。数字可作基线对照，**不能直接当作生产容量上限**。

---

## 2. 环境与范围

**覆盖**

- `GET /health`、`GET /metrics`
- Better Auth 注册/登录、未登录 401、sessions 列表
- 读类业务 API（users/settings/prompts/skills/workflows/audit/hitl）
- `POST /api/console/execute`（`mode=query`）幂等 + 轮询至 `completed`
- `mode=design` → `waiting_hitl` → approve → 二次 review `409`
- 单用户突发打满 RPM → 稳定 `429`、无 5xx 雪崩

**未覆盖（按设计）**

- 真实 LangGraph / 真实模型调用
- `POST /api/workflows/llm-generate`
- 外部 MCP / Tavily / 钉钉 SSO

---

## 3. 场景结果

| 场景 | 结果 | VU | 约时长 | 迭代 | HTTP 请求 | RPS | p95 (ms) | avg (ms) | checks |
|------|------|----|--------|------|-----------|-----|----------|----------|--------|
| 01 health-metrics | **PASS** | 5 | 20s | 330 | 660 | 32.7 | 4.9 | 2.7 | 990/990 |
| 02 auth-session | **PASS** | 8 | 30s | 321 | 1605 | 52.4 | 182.3 | 52.5 | 1605/1605 |
| 03 read-apis | **PASS** | 5 | 20s | 176 | 2288 | 111.6 | 76.8 | 13.6 | 4224/4224 |
| 04 execute-mock | **PASS** | 5 | 90s | 205 | 1435 | 15.6 | 576.4 | 106.3 | 1640/1640 |
| 05 hitl-review | **PASS** | 3 | 45s | 69 | 552 | 12.2 | 264.4 | 58.1 | 414/414 |
| 06 rate-limit | **PASS** | 1 | 1 iter | 1 | 82 | 48.1 | 8.2 | 8.4 | 4/4 |

原始 k6 summary（本地，已 gitignore）：`loadtest/reports/*-summary.json`

---

## 4. 关键断言明细

### 01 health-metrics
- `health 200` / `metrics 200`：全通过  
- `http_req_failed` = 0%

### 02 auth-session
- 未登录 `/api/users/me` → 401  
- sign-in 200 + session cookie  
- `/api/users/me`、`/api/sessions` → 200  
- 注：`http_req_failed`≈20% 来自**故意探测的 401**，阈值以 checks 为准

### 03 read-apis
- 11 条读路径全部「200 或 404」且无 5xx  
- `http_req_failed`≈30% 含预期非 2xx（如部分空资源 404），不以该指标判失败

### 04 execute-mock
- 入队 **202**；同 `Idempotency-Key` → 同 `executionId` 且 `created:false`  
- 轮询终态 **`completed`** 205/205  
- events 续订无 5xx  

### 05 hitl-review
- 找到 checkpoint；approve 2xx  
- 二次 review → **409 `HITL_ALREADY_RESOLVED`** 69/69  
- `http_req_failed`≈12.5% 来自预期 409

### 06 rate-limit
- 80 次突发 execute：**出现 429**  
- **无 5xx 风暴**

---

## 5. 发现与建议

| 发现 | 影响 | 建议 |
|------|------|------|
| Better Auth sign-in 无 `Origin` → 403 `MISSING_OR_NULL_ORIGIN` | 压测/前端跨源必踩 | 已在 k6 `jsonHeaders` 固定带 `ORIGIN`；保持与 `TRUSTED_ORIGINS` 一致 |
| Docker backend 镜像复制 pnpm `node_modules` 可能缺包 | 镜像启动失败 | 本轮用宿主机 `node dist/server/main.js`；后续修镜像打包 |
| migrate 对已有库重复 apply 可能 exit 3 | compose 依赖卡住 | 已有库可用 `--no-deps` 或修 migration 账本 |
| 短时长冒烟 ≠ 容量结论 | 误读风险 | 正式回归用 README 默认 VU/时长再跑一轮 |

---

## 6. 复现命令

```powershell
# 1) PG/Redis 已起；mock backend 在 :13000
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"   # = TRUSTED_ORIGINS

# 2) 单场景 / 全量
pnpm loadtest:scenario 01-health-metrics
pnpm loadtest:all
```

相关文档：

- 设计：`docs/superpowers/specs/2026-08-07-loadtest-design.md`
- 计划：`docs/superpowers/plans/2026-08-07-loadtest-baseline-plan.md`
- 使用说明：`loadtest/README.md`

---

## 7. 合并状态

- `feat/loadtest-baseline` 已 **fast-forward 合并至 `main`**
- 本地 `main` 相对 `origin/main` **ahead**（含设计/计划与压测套件提交）；未自动 push
