# 单机 2G：Query 有界并行吞吐设计

**日期**: 2026-08-07  
**分支**: `feat/single-node-query-throughput`  
**状态**: 已在本分支落地（`db7a582`…`52c189b`：InflightLimiter、MQ 有界并发+defer、分槽 Worker、queryMaxTokens、2G 运维说明）；全量 `pnpm test` / `pnpm run build` 通过；`pnpm lint` 与 main 同级既有失败，非本特性引入

---

## 1. 目标

在 **单机、约 2G 内存** 部署下，让 **几十人同时短 query** 时：

1. 多数请求能在约 **50s（p95 目标）** 内完成；
2. **忙时宁可排队变慢，也不中途强杀** 已开始的 LLM 调用（避免白烧 token）；
3. 不靠多开 Backend 进程堆并行（2G 下易 OOM）。

**硬约束**

- 生产形态仍为：PostgreSQL + Redis + `MQ_ENABLED=true` + Better Auth（与现有规范一致）。
- 分层红线不变：配置进 `FrameworkConfig` / `loadConfig` / `.env.example`；MQ 改动落在 `adapter/` + `server/`。
- Key / 密钥不入库。

**明确不做（本期）**

- design / table 也承诺 p95≤50s
- 忙时过载 **429 拒绝入队**（默认关闭；见 §5）
- 对 **running** 执行做 SLA 墙钟强制 abort
- Actor 模型、`worker_threads` 并行、多机自动扩缩
- 每用户自带 LLM Key（BYOK）
- 默认把 mock `loadtest:all` 并入真 LLM 烧钱场景

---

## 2. 问题陈述

当前单进程路径：

```text
HTTP 202 入队 → Redis Streams → Consumer COUNT=1 → await 整段执行（含 LLM）→ 再读下一条
```

结果：全局有效并行 ≈ **1**。几十人同时 query 时，排队叠加上单次模型耗时，完成时间可到数分钟。  
API/Postgres 不是主因；**串行消费 + 共享模型耗时** 才是。

多开 Worker 进程在内存宽裕时有效，但 **2G 下复制多份 Node 不划算**。

---

## 3. 关键决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 并行模型 | **单进程有界 inflight** | I/O 等待可并发；不倍增 RSS |
| 默认 inflight | query **4**（可调 4–8）；design **1** | 2G 起步保守，可阶梯上调 |
| 忙时策略 | **排队背压，不默认 429** | 用户要求忙时不拒；入队前拒也不必要作为默认 |
| 已开始的执行 | **跑完**（用户主动 cancel 除外） | 中途 abort 浪费已计费 token |
| 50s 含义 | **优化目标 / 观测 SLO**，非硬杀门槛 | 用并行度与快路径逼近，不用超时砍任务 |
| 可选「未开工放弃」 | **本期不做默认行为**；仅保留为后续可选 | 0 token，但改变「一定排队等到跑」的产品语义 |
| 多进程 scale | 2G **不推荐** | 每进程数百 MB |
| Actor / worker_threads | **不用** | 不对症且费内存 |

---

## 4. 方案概述

### 4.1 消费：有界并行

改造 Redis 消费（或等价包装），使同一 Backend 进程内：

- 同时处理中的消息数 ≤ `QUERY_MAX_INFLIGHT`（仅统计 `mode=query`，或按队列/payload 区分）；
- design（及 table，若同队列）受 `DESIGN_MAX_INFLIGHT`（默认 1）约束；
- 槽满时：**消息留在队列 / PEL，不丢、不因 SLA 失败**；有空槽再取下一条并调用 LLM；
- 单条消息的 handler 仍可 `await` 至执行结束；并行来自 **多条 handler 同时进行**，而非多线程。

实现注意：

- 今日 `RedisMessageQueueAdapter.consumeLoop` 对 `processEntry` 串行 `await`，且 `XREADGROUP COUNT 1`；需改为在 inflight 未满时继续读/派发，满则阻塞或短睡，避免无界堆积到进程内。
- 保持 at-least-once、心跳刷新 visibility、失败重试/DLQ 语义；并发下 `inFlight` Set、ACK 路径需可重入安全。
- Consumer Group 名不变，便于以后内存变大时再水平加进程（非本期必做）。

### 4.2 Query 快路径（压低单次 \(T_{\text{llm}}\)）

在 **不改变「跑完」语义** 的前提下缩短短问答耗时：

- `QUERY_MAX_TOKENS`（建议默认 1024，可配）
- 维持/收紧 `QUERY_AGENT_MAX_ITERATIONS`（已有配置则复用）
- 短 query 场景建议文档化：可关或弱化 MCP / Tavily（配置项，非强制改默认生产开关）
- 可选：query 使用更快模型（若已有 per-mode 模型配置则接入；否则记为后续增强，不阻塞 P0）

### 4.3 租户与配额（保留）

- `MAX_CONCURRENT_PER_USER`：2G 建议默认 **2**（可配）；超限行为保持现有 requeue/重试语义，**不改为丢弃**。
- 用户/全局 RPM：继续保护共享 API Key；与 inflight 正交。

### 4.4 2G 部署配比（运维约定，代码侧文档化）

| 组件 | 建议 |
|------|------|
| Backend | **1** 进程；`NODE_OPTIONS=--max-old-space-size=768`（量级） |
| Redis | `maxmemory` ~64–128MB |
| Postgres | 小 `shared_buffers`，整库量级约 256–384MB |
| Frontend | 尽量不占同一 2G |
| `docker compose --scale backend=N` | 2G 下避免 |

---

## 5. 明确不做的「拒绝 / 超时」行为

| 行为 | 本期 |
|------|------|
| 过载入队 429 `QUERY_OVERLOAD` | **默认不做** |
| `QUERY_SLA_MS` 到点 abort running | **不做** |
| 排队过久自动 abandoned（未调 LLM） | **不做默认**；若未来加，必须可关且审计 |

用户主动 `cancel`、以及现有任务超时配置（如极长的 `EXECUTION_TASK_TIMEOUT_MS`）是否动刀：本期 **不借 SLA 名义缩短为 50s 强杀**；若动现有超时，须单独评审且默认仍远大于短 query。

---

## 6. 配置项（须三处同步）

新增/确认（名称以实现计划为准，语义固定）：

| 变量 | 建议默认 | 含义 |
|------|----------|------|
| `QUERY_MAX_INFLIGHT` | `4` | 单进程同时跑的 query 上限 |
| `DESIGN_MAX_INFLIGHT` | `1` | 单进程同时跑的 design（及同级重任务）上限 |
| `QUERY_MAX_TOKENS` | `1024` | query 输出 token 上限（快路径） |

已有可复用：

- `MAX_CONCURRENT_PER_USER`
- `QUERY_AGENT_MAX_ITERATIONS`
- `COST_RPM_LIMIT_PER_USER` / `COST_GLOBAL_RPM_LIMIT`
- MQ：`MQ_VISIBILITY_TIMEOUT_MS` 等（并发下确认心跳仍足够）

**不**新增默认开启的 `QUERY_SLA_MS` 强杀项。

---

## 7. 观测与验收

### 7.1 指标（至少日志或可导出）

- query：排队时长（入队 → claim/开始推理）、推理时长、端到端时长
- 当前 query/design inflight
- 完成态分布：`completed` / `failed` / `cancelled`（不应因本方案新增大量 `timed_out`）

### 7.2 验收场景

1. **功能**：单用户短 query 仍正常 completed。  
2. **并行**：同机注入 N 个短 query（N > `QUERY_MAX_INFLIGHT`），应观察到同时 running 数 ≈ inflight，且总完成时间明显优于串行基线（同模型、同提示）。  
3. **忙时不杀**：高排队下已 running 任务不被本方案 abort；无默认过载 429。  
4. **内存**：2G cgroup/机器上 `QUERY_MAX_INFLIGHT=4` 稳态不 OOM（阶梯试 6/8 另记）。  
5. **回归**：`pnpm` 单测覆盖 MQ/Worker 有界并发；真 LLM 用现有 `loadtest:llm` 做人工/可选门禁（**不**强制并进默认 `loadtest:all`）。  

**SLO 表述**：在短 query + 建议模型下，争取 **p95 端到端 ≤ 50s**（如 30–50 VU×1）；未达标时优先调 inflight / 快路径 / 模型，而不是加拒绝。

---

## 8. 分期

| 期 | 内容 | 交付 |
|----|------|------|
| **P0** | MQ/Worker 有界 inflight；query/design 分槽；配置三处同步 | 单机并行吞吐上来 |
| **P1** | Query `maxTokens`（及必要接线）；文档化 2G 与推荐 env | 压低 \(T_{\text{llm}}\) |
| **P2** | 排队 vs 推理时长观测；压测对照报告（串行基线 vs 有界并行） | 可证明与可调参 |
| **P3（可选）** | 未开工排队放弃（默认关）；query 专用模型；内存充裕时多进程指南 | 增强项 |

---

## 9. 风险与边界

- **共享 API Key**：inflight 提高后更易撞供应商 RPM/TPM → 靠现有限流与调低 inflight。  
- **单次模型本身接近/超过 50s**：有界并行无法让「每一个」都 ≤50s；只能改善排队，不能违反物理耗时。  
- **design 与 query 同队列**：分槽实现需按 payload `mode` 或拆队列；实现计划选定一种，避免 design 占满 query 槽。  
- **可见性超时**：长 query 仍依赖现有心跳；并发增加后回归 PEL reclaim 行为。

---

## 10. 相关文档

- 压测（mock）：`docs/superpowers/specs/2026-08-07-loadtest-design.md`
- 压测（真 LLM query）：`docs/superpowers/specs/2026-08-07-loadtest-llm-query-design.md`
- 基线/LLM 报告：`docs/superpowers/reports/2026-08-07-loadtest-*-report.md`

---

## 11. Spec 自检

- [x] 无 TBD/占位实现细节冒充已定（可选增强已标 P3）
- [x] 与「忙时不拒、不中途杀」决策一致；已删除先前草案中的默认 429 / 50s abort
- [x] 范围收束在单机 2G query 吞吐；不做 Actor/多机/BYOK
- [x] 配置变更路径符合项目三处同步规范
