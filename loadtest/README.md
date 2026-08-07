# Loadtest 压测基线

无真实 LLM 的 Docker 全栈 k6 压测套件。覆盖入队 → Worker → Mock Director → SSE / HITL 全链路，不调用真实模型。

## 前置条件

1. **Docker Desktop** 已安装并运行。
2. 项目根目录已有 `.env`（可从 `.env.example` 复制），且 **`BETTER_AUTH_SECRET` 至少 32 字符**。
3. Postgres、Redis 由 Docker Compose 提供（`docker-start.mjs` 或 `docker compose`）。

## 配置压测环境

将 `loadtest/.env.loadtest.example` 中的变量合并到项目根 `.env`（覆盖对应项），然后重建/重启 backend：

```bash
# 首次或改源码后
node docker-start.mjs --rebuild

# 已有镜像、仅改环境变量时
docker compose up -d backend
```

等待 backend 就绪：

```bash
curl -f http://localhost:13000/health
# 应返回 HTTP 200
```

## 运行场景

**单场景**（排障或 CI 单测）：

```bash
pnpm loadtest:scenario -- 01-health-metrics
```

**全量场景**（顺序跑完 01–06 并汇总）：

```bash
pnpm loadtest:all
```

## 报告

k6 生成的 summary / JSON 等输出写入 **`loadtest/reports/`**（已 gitignore，不入库）。对比多次运行时可查看 p95、错误率、429/幂等等指标。

## Windows 说明

k6 在 Docker 容器内运行，访问宿主机上的 backend 时使用 **`host.docker.internal:13000`**（而非 `localhost`）。npm 脚本已按此配置 `BASE_URL`；若手动跑 k6，请确保目标地址可达。

## 范围说明

- **本基线**：`AGENT_FRAMEWORK=mock` + 占位 `LLM_API_KEY`，无真实 LangGraph / 外部 LLM / MCP / Tavily。
- **真 LLM 压测**：不在本目录范围，需另开规格与配置。

设计文档：`docs/superpowers/specs/2026-08-07-loadtest-design.md`
