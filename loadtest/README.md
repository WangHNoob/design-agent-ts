# Loadtest 压测基线

无真实 LLM 的 k6 压测套件。覆盖 health/auth/读 API、入队 → Worker → Mock Director → 终态、HITL 审阅与 RPM 429，不调用真实模型。

## 前置条件

1. **Docker Desktop** 运行中（至少 Postgres + Redis）。
2. 项目根目录已有 `.env`（可从 `.env.example` 复制），且 **`BETTER_AUTH_SECRET` 至少 32 字符**。
3. **k6**：Windows 推荐本机安装（`winget install GrafanaLabs.k6`）。也可用 Docker 镜像（`LOADTEST_K6_MODE=docker`），需能拉取 `grafana/k6`。
4. Backend 以 **`AGENT_FRAMEWORK=mock`** + 非空占位 **`LLM_API_KEY`** 启动（否则 `/execute` 返回 `409 not_configured`）。

## 配置压测环境

将 `loadtest/.env.loadtest.example` 中的变量合并到项目根 `.env`（覆盖对应项）。

**推荐启动方式（当前）**：Docker 提供 PG/Redis，宿主机跑 mock backend（避开部分环境下 Docker 镜像 `node_modules` 复制不完整的问题）：

```powershell
# 终端 1：infra 已 up 时
$env:AGENT_FRAMEWORK="mock"
$env:LLM_API_KEY="sk-loadtest-placeholder"
$env:HITL_ENABLED="true"
$env:PORT="13000"
$env:BETTER_AUTH_BASE_URL="http://localhost:13000"
pnpm run build
node --env-file=.env dist/server/main.js
```

也可尝试 `node docker-start.mjs --rebuild` 后 `docker compose up -d backend`（需镜像依赖完整）。

等待就绪：

```bash
curl -f http://localhost:13000/health
# 应返回 HTTP 200
```

## 运行场景

**重要：`ORIGIN` 必须匹配服务端 `TRUSTED_ORIGINS`（默认 `http://localhost:3001`）**，否则 Better Auth sign-in 返回 `403 MISSING_OR_NULL_ORIGIN`。

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"   # 与 .env 中 TRUSTED_ORIGINS 一致
```

**单场景**：

```bash
pnpm loadtest:scenario 01-health-metrics
```

**全量场景**（顺序 01–06）：

```bash
pnpm loadtest:all
```

可选缩短时长做冒烟：`$env:DURATION="30s"; $env:VUS="5"`。

强制 Docker 跑 k6：`$env:LOADTEST_K6_MODE="docker"`（此时默认 `BASE_URL=http://host.docker.internal:13000`）。

## 报告

k6 summary JSON 写入 **`loadtest/reports/`**（已 gitignore）。关注 checks 成功率、p95、幂等 `created:false`、429、HITL 409。

## Windows 说明

- 默认优先本机 `k6.exe`（路径含空格时 runner 已处理）。
- Docker k6 访问宿主机 backend 用 `host.docker.internal:13000`。
- Auth 请求会自动带 `Origin` / `Referer`（见 `loadtest/k6/lib/config.js`）。

## 范围说明

- **本基线**：`AGENT_FRAMEWORK=mock` + 占位 `LLM_API_KEY`，无真实 LangGraph / 外部 LLM / MCP / Tavily。
- **真 LLM 压测**：不在本目录范围，需另开规格与配置。

## 首轮基线（2026-08-07）

| 项 | 值 |
|----|-----|
| 环境 | Docker PG(`5433`)+Redis；宿主机 mock backend `:13000`；本机 k6 2.1.0 |
| 机器 | Windows 10，本地开发机 |
| 01 health | PASS（短跑 5 VU×20s，checks 100%，p95≈5ms） |
| 02 auth-session | PASS（需 `ORIGIN=http://localhost:3001`） |
| 03 read-apis | PASS（checks 100%；部分路径 404 属预期，不以 `http_req_failed` 判失败） |
| 04 execute-mock | PASS（query 入队+幂等+轮询 `completed`） |
| 05 hitl-review | PASS（design→`waiting_hitl`→approve；二次 review 409） |
| 06 rate-limit | PASS（出现 429，无 5xx 风暴） |

已知限制：全量 B 档默认时长约 20 分钟；Docker backend 镜像若缺依赖可改用宿主机 `pnpm`/`node dist`；宿主机资源不足时结果勿当作生产容量结论。

设计文档：`docs/superpowers/specs/2026-08-07-loadtest-design.md`
