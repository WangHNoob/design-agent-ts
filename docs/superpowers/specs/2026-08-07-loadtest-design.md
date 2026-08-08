# 无真实 LLM 的 Docker 压测基线设计

**日期**: 2026-08-07  
**分支**: `main`  
**状态**: 已实施（2026-08-07 基线报告见 `docs/superpowers/reports/2026-08-07-loadtest-baseline-report.md`）

---

## 1. 目标

在当前 `design-agent-ts` / `game-designer-ts` 项目中建立：

1. **可重复的回归压测基线**：k6 场景脚本入库，固定 VU/时长/阈值，大改后可复跑对比。
2. **日常容量摸底（B 档）**：约 20–50 VU，分场景 3–5 分钟，在 Docker 全栈上发现延迟、错误率、队列/SSE 异常。

**硬约束**：

- 环境：**Docker 全栈**（backend + Postgres + Redis），默认 `BASE_URL=http://localhost:13000`。
- 深度：**外围 API + `AGENT_FRAMEWORK=mock` 全链路**（入队 → Worker → Mock Director → SSE / 可选 HITL → 终态），**不调用真实 LLM**。
- 量级：**日常回归 B 档**（非阶梯冲高到 100+ VU）。

**明确不做**：

- 真实 LangGraph / 真实模型调用
- `POST /api/workflows/llm-generate`
- 外部 MCP / Tavily / 钉钉 SSO
- 并行维护 Artillery 或自研压测框架
- 将生产默认配置改为 mock
- 提交真实密钥或大体量报告文件

---

## 2. 关键决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 压测工具 | **k6**（官方 Docker 镜像跑） | 阈值/阈值/报告成熟；Cookie/SSE 友好；适合回归基线 |
| 运行环境 | **Docker 全栈** | 最接近生产形态（PG + Redis + MQ） |
| Agent 路径 | **`AGENT_FRAMEWORK=mock` + 占位 `LLM_API_KEY`** | 避免 `409 not_configured`；覆盖 enqueue/Worker/SSE 而无真 LLM |
| 量级 | **20–50 VU，每场景 3–5 分钟** | 日常回归够用，避免本机假瓶颈主导结论 |
| 场景组织 | **分文件可单独跑 + `run-all` 汇总** | 排障与 CI 友好 |
| HITL 场景 | **优先走 mock 自然 pending；否则 seed；再否则跳过并记录** | 不因 mock 不进 HITL 阻断整套基线 |
| 报告入库 | **`loadtest/reports/` gitignore** | 只保留 README 解读方式，报告本地生成 |

---

## 3. 目录结构

```text
loadtest/
  README.md                 # 起栈、环境变量、跑场景、读报告
  k6/
    lib/auth.js             # sign-up / sign-in，Cookie jar
    lib/config.js           # BASE_URL、VU、时长、阈值
    scenarios/
      01-health-metrics.js
      02-auth-session.js
      03-read-apis.js
      04-execute-mock.js
      05-hitl-review.js
      06-rate-limit.js
    run-all.sh              # 或 run-all.mjs：顺序跑全场景并汇总
  reports/                  # gitignore，本地生成
```

`package.json` 增加脚本（例如 `loadtest:docker` / `loadtest:scenario`），通过 Docker 调用 k6 镜像，对已启动的 backend 施压。

---

## 4. 环境前置

压测前 Docker 栈必须满足：

| 项 | 要求 |
|----|------|
| `MQ_ENABLED` | `true` |
| Postgres / Redis | 健康（`/health` 为 200） |
| `AGENT_FRAMEWORK` | `mock` |
| `LLM_API_KEY` | 任意非空占位（仅用于启动 Director） |
| Better Auth | `BETTER_AUTH_SECRET` 等已按 `.env.example` 配置 |
| 鉴权方式 | 脚本自动注册/登录，请求带 `better-auth.session_token` Cookie |

`.env.example` 与 `loadtest/README.md` 补充压测说明；**不**把密钥写入仓库。

VU 使用唯一邮箱前缀（或 setup 阶段预创建用户池），避免注册冲突。

---

## 5. 场景矩阵与验收阈值

| 场景 | VU / 时长 | 行为 | 主要断言 |
|------|-----------|------|----------|
| **01 health-metrics** | 30 VU × 3min | `GET /health`、`GET /metrics` | 成功率 ≥ 99%；p95 &lt; 200ms |
| **02 auth-session** | 20 VU × 3min | sign-in / get-session；sessions 读写删（租户隔离） | 鉴权成功 ≥ 99%；未登录稳定 401 |
| **03 read-apis** | 30 VU × 3min | `/me`、settings、prompts、skills、workflows、audit 等读接口 | 2xx ≥ 99%；p95 &lt; 500ms |
| **04 execute-mock** | 20 VU × 5min | `POST /api/console/execute`（唯一 Idempotency-Key）→ SSE 订阅读到终态；抽测幂等重复 POST | 入队 202；终态成功完成；SSE 不断流；幂等不双入队 |
| **05 hitl-review** | 10–15 VU × 3min | pending → approve/reject/modify；探测 CAS 冲突 | 审阅结果符合契约；冲突返回可预期 409；无 pending 时跳过并记录 |
| **06 rate-limit** | 单用户突发 | 短时打爆 `COST_RPM_LIMIT_PER_USER` | 稳定出现 429，非 5xx 雪崩 |

**失败判据**：任一场景错误率超阈值，或出现 5xx、队列/SSE 大面积超时。

---

## 6. 观测与报告

- k6 标准 summary + JSON（可选 HTML）写入 `loadtest/reports/`
- Prometheus/Grafana（compose `--infra`）为可选对照，非必须
- README 说明如何解读：吞吐、p95、错误分类、幂等/429/终态比例
- 文档注明：本机 Docker 资源不足可能导致「假瓶颈」，报告需区分应用瓶颈与宿主机打满

---

## 7. 与现有架构的衔接点

| 组件 | 路径 / 行为 | 压测关注点 |
|------|-------------|------------|
| HTTP 入口 | `src/server/app.ts` + `routes/*` | 鉴权中间件、RPM、读写 API |
| 执行入队 | `POST /api/console/execute*` → `ExecutionService` → Redis Streams | 幂等、202、并发槽 |
| Worker | `ExecutionWorker` + `AGENT_FRAMEWORK=mock` | 队列深度、终态、超时 |
| SSE | `openExecutionEventStream` | 续订、心跳、断连不杀 Worker |
| HITL | `DurableHumanReviewGateway` + `/api/hitl/*` | pending / review / CAS |
| Auth | Better Auth `/api/auth/*` | Cookie 会话吞吐 |

真实 LLM 路径（LangGraph Director、`llm-generate` 等）**不在本基线范围**，后续可另开「真 LLM 压测」规格。

---

## 8. 实现顺序

1. 环境开关与文档：Docker mock 启动说明、`.env.example`、`loadtest/README`
2. k6 公共库：`config`、`auth`、共享 check/阈值
3. 按序实现场景 01→06（均可单独跑）
4. `run-all` 编排 + `package.json` 脚本
5. 在本机 Docker 实跑一轮，修复脚本/配置，产出首份本地基线报告
6. `.gitignore` 增加 `loadtest/reports/`

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| Mock Director 与真 LLM 路径不完全一致 | 文档标明范围；真 LLM 另开规格 |
| Mock 下不一定进入 `waiting_hitl` | 05：自然 pending → seed → 跳过并记录 |
| Docker 资源不足造成假瓶颈 | README 注明建议资源；报告解读时声明 |
| Better Auth 邮箱唯一 / 注册冲突 | VU 唯一邮箱或用户池 setup |
| `/execute` 返回 `409 not_configured` | 强制 mock + 非空占位 Key |

---

## 10. 交付物

| 交付 | 说明 |
|------|------|
| `loadtest/` 套件 | 可复跑 k6 场景 + README |
| npm 脚本 | 一键对 Docker backend 压测 |
| 首份基线结果 | 本地 `loadtest/reports/`（不入库） |
| 本设计文档 | `docs/superpowers/specs/2026-08-07-loadtest-design.md` |
