# Loadtest 压测基线

含两套入口：

1. **Mock（无真实 LLM）**：场景 01–06，`pnpm loadtest:all`
2. **真实 LLM query（预发档）**：场景 07，`pnpm loadtest:llm`（默认约 30 用户 × 2 次 = 60 次真调用）

## 前置条件

1. **Docker Desktop** 运行中（至少 Postgres + Redis）。
2. 项目根目录已有 `.env`（可从 `.env.example` 复制），且 **`BETTER_AUTH_SECRET` 至少 32 字符**。
3. **k6**：Windows 推荐本机安装（`winget install GrafanaLabs.k6`）。也可用 Docker 镜像（`LOADTEST_K6_MODE=docker`）。
4. Mock 套件：`AGENT_FRAMEWORK=mock` + 非空占位 `LLM_API_KEY`。  
   真 LLM 套件：`AGENT_FRAMEWORK=langgraph` + **真实** `LLM_API_KEY`（见 `.env.loadtest.llm.example`）。

## 配置压测环境

### Mock

将 `loadtest/.env.loadtest.example` 合并进根 `.env` 后重启 backend。

### 真实 LLM

将 `loadtest/.env.loadtest.llm.example` 的说明合并进根 `.env`（**Key 只放在私有 `.env`，勿提交**）。建议压测时 `HITL_ENABLED=false`。

**推荐启动（宿主机 backend + Docker PG/Redis）**：

```powershell
$env:PORT="13000"
$env:BETTER_AUTH_BASE_URL="http://localhost:13000"
# mock 或 langgraph 以 .env 为准；可用临时覆盖：
# $env:AGENT_FRAMEWORK="langgraph"
pnpm run build
node --env-file=.env dist/server/main.js
```

```bash
curl -f http://localhost:13000/health
```

## 运行场景

**重要：`ORIGIN` 必须匹配 `TRUSTED_ORIGINS`（默认 `http://localhost:3001`）。**

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
```

**Mock 单场景 / 全量（01–06，不含真 LLM）：**

```bash
pnpm loadtest:scenario 01-health-metrics
pnpm loadtest:all
```

**真实 LLM query（07，会消耗 token）：**

```powershell
# 建议先小跑
$env:LLM_USERS="5"; $env:LLM_ITERS_PER_USER="1"
pnpm loadtest:llm

# 预发默认：30×2=60 次
Remove-Item Env:LLM_USERS -ErrorAction SilentlyContinue
Remove-Item Env:LLM_ITERS_PER_USER -ErrorAction SilentlyContinue
pnpm loadtest:llm
```

可选：`$env:LLM_EXEC_TIMEOUT_SEC="240"`。

强制 Docker 跑 k6：`$env:LOADTEST_K6_MODE="docker"`。

## 报告

k6 summary → `loadtest/reports/`（gitignore）。  
书面报告示例：`docs/superpowers/reports/`。

## Windows 说明

- 默认本机 `k6.exe`；Docker k6 用 `host.docker.internal:13000`。
- Auth 自动带 `Origin` / `Referer`。

## 范围说明

| 套件 | 内容 |
|------|------|
| Mock 01–06 | 无真实模型；可高频回归 |
| LLM 07 | 真模型 `mode=query`；预发多用户；固定次数控费 |
| 不做 | design/table 真 LLM、阶梯冲高容量探测（另开规格） |

## 首轮 Mock 基线（2026-08-07）

见 `docs/superpowers/reports/2026-08-07-loadtest-baseline-report.md`。

## LLM 07 运行记录与已知现象（2026-08-07 ~ 08-08）

- `loadtest/reports/` 下 08-07 下午及 08-08 凌晨的多次 `07-query-llm-*summary.json`
  显示 check 通过率恒为 **2/3（如 10/15、320/480）**，与书面 "100% checks" 基线报告
  不一致：每次迭代恰好有一个检查失败。
- 原因核查（2026-08-08）：合并 summary 的 `checks` 指标**不区分检查名**，无法直接
  定位失败项；经 07 场景逐迭代日志与在线复现确认，失败项为 `execution completed`，
  根因是 **LLM 端点返回空/失败响应**（08-08 期间 `deepseek-v4-flash` 端点间歇返回
  `finish_reason=length` + 空内容，此前 loadtest 还遇到过 403），执行落为 failed 而非
  代码回归。后端已加"空响应视为可重试失败"（`classifyModelError` / invokeLlm），
  下次 LLM 压测应在端点健康时段重跑并对比。
- 自 2026-08-08 起 07 场景输出 `per_check` 逐检查计数，新报告可直接定位失败检查。

设计文档：

- Mock：`docs/superpowers/specs/2026-08-07-loadtest-design.md`
- LLM：`docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md`
