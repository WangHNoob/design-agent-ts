# 真实 LLM Query 压测（预发档）设计

**日期**: 2026-08-07  
**分支**: `main`  
**状态**: 已实施（2026-08-07 LLM 报告见 `docs/superpowers/reports/2026-08-07-loadtest-llm-query-report.md`）

---

## 1. 目标

在现有无 LLM（mock）k6 基线之上，补充 **真实 LLM** 压测：

1. 仅 **`mode=query`**（不做 design/table）。
2. **预发档多用户并发**：默认合计约 **20–50** 路（默认 **30** 用户），贴近小团队同时使用，而非仅 5–10 冒烟。
3. **固定总调用次数 + 熔断**：默认 `30 用户 × 每人 2 次 = 60` 次真实 execute，控费；错误/超时超阈值则非 0 退出。

**硬约束**

- 使用用户已配置的真实 `.env`：`AGENT_FRAMEWORK=langgraph` + 有效 `LLM_API_KEY`（Key **不入库**）。
- 与 mock 场景隔离：默认 `pnpm loadtest:all` **仍只跑 01–06**；真 LLM 走独立 `pnpm loadtest:llm`。
- 环境：与现有套件一致（Docker PG/Redis + backend；Windows 优先本机 k6）。

**明确不做**

- 真实 design / table 全链路
- 真 LLM HITL 长流程专项
- 阶梯冲高到系统拐点（容量探测另开规格）
- 将仓库默认配置改为必须烧真 LLM

---

## 2. 关键决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 模式 | 仅 `query` | 单次调用可控，费用与时长可预期 |
| 量级 | 预发 **20–50** 合计并发（默认 30） | 用户要求更贴近生产小团队；5–10 不足以代表预发 |
| 控费 | 固定 iterations + checks 熔断 | 避免按时长漂次数 |
| 多租户 | setup 用户池，每 VU 绑定一用户 | 避免全挤单用户只撞到 `MAX_CONCURRENT_PER_USER=3` |
| 入口 | `loadtest:llm` 独立 | 防止误跑 `loadtest:all` 烧钱 |
| HITL | 建议压测时 `HITL_ENABLED=false` | query 不走 HITL-1；减少扫表噪音 |

---

## 3. 目录与组件

```text
loadtest/
  .env.loadtest.llm.example      # langgraph 提示；无真实 Key
  README.md                      # 增补真实 LLM / 预发档章节
  k6/
    lib/userPool.js              # setup 预注册；getUser(vu)
    scenarios/07-query-llm.js    # 真实 query 场景
```

`package.json`：

- `loadtest:llm` → 跑 `07-query-llm`（经现有 `run-scenario.mjs`）

---

## 4. 参数（可用环境变量覆盖）

| 变量 | 默认 | 含义 |
|------|------|------|
| `LLM_USERS` | `30` | 预注册用户数 = VU 数（建议 20–50） |
| `LLM_ITERS_PER_USER` | `2` | 每用户 execute 次数 |
| `LLM_EXEC_TIMEOUT_SEC` | `180` | 单次轮询终态超时 |
| `BASE_URL` | `http://localhost:13000` | 被测 API |
| `ORIGIN` | `http://localhost:3001` | Better Auth 可信 Origin |

总执行次数上限 = `LLM_USERS × LLM_ITERS_PER_USER`（默认 **60**）。

**熔断阈值（k6）**

- `checks` 成功率 ≥ 90%
- 终态以 `completed` 为主；`failed` / `timed_out` / 等待超时合计不超过可配置上限（实现时以 checks 表达，例如 `execution completed` 占比 ≥ 90%）

**建议先小跑**：`LLM_USERS=5` `LLM_ITERS_PER_USER=1`，再上默认 30×2。

---

## 5. 场景行为（07-query-llm）

1. **setup**：注册 `LLM_USERS` 个唯一邮箱用户，缓存 cookie；失败则 abort。
2. **default**：VU 取绑定用户 → `POST /api/console/execute`（`mode: query`，短 requirement，唯一 `Idempotency-Key`）→ 轮询 `GET /api/console/executions/:id` 至终态或超时。
3. **断言**：入队 202；终态 `completed`（或计入失败统计）；无大面积 5xx。
4. **teardown**（可选）：不强制删用户（压测库可接受残留）。

复用现有 `lib/auth.js` / `lib/config.js`（含 Origin）。

---

## 6. 环境前置

| 项 | 要求 |
|----|------|
| `AGENT_FRAMEWORK` | `langgraph` |
| `LLM_API_KEY` / model / base URL | 用户 `.env` 已配置且可用 |
| Postgres / Redis / `MQ_ENABLED` | 健康 |
| 建议 `HITL_ENABLED` | `false`（可选） |
| `COST_RPM_LIMIT_PER_USER` / `MAX_CONCURRENT_PER_USER` | 保持生产相近值，便于观察限流与槽位 |

`.env.loadtest.llm.example` 只写说明与非密钥项；**禁止**提交真实 Key。

---

## 7. 与 mock 基线关系

| 套件 | 场景 | 目的 |
|------|------|------|
| mock（现有） | 01–06 | 无 LLM 回归，可高频跑 |
| llm（本设计） | 07 | 真模型 query 预发档，控费低频跑 |

报告：`docs/superpowers/reports/YYYY-MM-DD-loadtest-llm-query-report.md`（跑完后生成）。

---

## 8. 实现顺序

1. env 示例 + README 章节  
2. `userPool.js`  
3. `07-query-llm.js` + 阈值  
4. `loadtest:llm` 脚本  
5. 小跑 → 默认 30×2 → 写报告  

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 账单 / 供应商限流 | 固定 60 次；先 5×1；熔断退出 |
| 模型慢假失败 | `LLM_EXEC_TIMEOUT_SEC` 可调 |
| 误跑烧钱 | `loadtest:all` 不含 07 |
| 单用户假瓶颈 | 每 VU 独立用户 |
| 无法代表「无限生产」 | 文档写明：预发档，非阶梯容量探测 |

---

## 10. 交付物

| 交付 | 说明 |
|------|------|
| `07-query-llm` + userPool | 可复跑真 LLM query 预发压测 |
| `pnpm loadtest:llm` | 独立入口 |
| README / env example | 费用与隔离说明 |
| 本设计文档 | `docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md` |
| 跑后报告 | `docs/superpowers/reports/`（实现阶段产出） |
