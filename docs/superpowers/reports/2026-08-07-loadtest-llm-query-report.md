# 压测报告：真实 LLM Query（预发档）

**日期**: 2026-08-07  
**分支**: `main`  
**场景**: `07-query-llm`（`pnpm loadtest:llm`）  
**结论**: **冒烟未通过（阻塞在 LLM 鉴权）** — 压测脚本与多用户入队正常，真实模型调用因 API Key 无效全部失败

---

## 1. 摘要

| 项 | 内容 |
|----|------|
| 计划量级 | 预发默认 30×2=60；本轮先冒烟 **5×1=5** |
| Backend | 宿主机 `langgraph` `:13000`；Docker PG/Redis |
| 入队 | **PASS** — 5/5 返回 202 |
| 终态 `completed` | **FAIL** — 0/5（快速变为 `failed`） |
| 根因 | LLM HTTP **401 authentication_error: token not found**；运行时模型曾被 `settings.json` 覆盖为错误配置 |

---

## 2. 冒烟结果（5 users × 1 iter）

| 指标 | 值 |
|------|-----|
| checks 成功率 | 66.67%（阈值要求 ≥90% → exit 99） |
| pool user bound | 5/5 |
| execute 202 | 5/5 |
| execution completed | **0/5** |
| http_req_failed | 0%（业务失败体现在 execution status，非 HTTP 5xx） |
| 单次迭代约 | ~3.3s（失败很快返回，未跑满 180s 超时） |

---

## 3. 根因说明

1. **`settings.json` 优先于 `.env`**（`SettingsManager`）：本地 `settings.json` 曾为占位 Key + `claude-opus`，与 `.env` 中 `qwen3.7-plus` 不一致。启动日志可见 `model=claude-opus` 后 401。
2. 将 settings 与 `.env` 对齐后发现：**`.env` 的 `LLM_API_KEY` 长度=12，且值等于 `LLM_MODEL`（`qwen3.7-plus`）**，不是阿里云 MaaS 的真实 token。  
   因此无论 settings 如何同步，供应商都会 `token not found`。

**脚本侧无需为「假完成」放宽阈值**；应先修好 Key 再复跑。

---

## 4. 你需要做的（然后复跑）

1. 在根目录 **`.env`** 中把 `LLM_API_KEY` 改成阿里云 MaaS **真实 API Token**（不要填模型名）。
2. 同步到 **`settings.json`**（gitignored）的 `modelApiKey` / `modelName` / `modelBaseUrl`，或删掉错误占位后重启，让 bootstrap 按你的流程加载。
3. 重启 backend（`AGENT_FRAMEWORK=langgraph`）。
4. 先小跑再预发：

```powershell
$env:BASE_URL="http://localhost:13000"
$env:ORIGIN="http://localhost:3001"
$env:LLM_USERS="5"; $env:LLM_ITERS_PER_USER="1"
pnpm loadtest:llm

# 通过后再：
# Remove-Item Env:LLM_USERS, Env:LLM_ITERS_PER_USER
# pnpm loadtest:llm   # 默认 30×2
```

---

## 5. 已交付的压测能力（待 Key 修复后即可用）

| 交付 | 路径 |
|------|------|
| 场景 07 | `loadtest/k6/scenarios/07-query-llm.js` |
| 用户池 | `loadtest/k6/lib/userPool.js` |
| 入口 | `pnpm loadtest:llm` |
| 环境说明 | `loadtest/.env.loadtest.llm.example`、`loadtest/README.md` |
| 设计 | `docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md` |

---

## 6. 与生产覆盖的关系

- 本套件按设计为 **预发多用户 query**（默认约 30 并发用户 × 固定次数），在 Key 可用后可验证：多租户入队、Worker、真模型延迟、并发槽与 RPM。
- **仍不是**无限阶梯容量探测；Key 修复并跑通 30×2 后，可再出第二版「通过」报告替换本节结论。
