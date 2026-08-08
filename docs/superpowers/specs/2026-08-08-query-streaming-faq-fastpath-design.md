# Query 真流式 TTFT + Knowledge Hub FAQ 短路设计

**日期**: 2026-08-08  
**分支**: `main`（待开 feature 分支实施）  
**状态**: 已确认设计意向；待用户审阅本 spec 后进入实现计划

---

## 1. 目标

1. **未命中 FAQ**：Query 路径 LLM 答案 **token 级推送到 SSE**，降低首字延迟（TTFT）。  
2. **命中 FAQ**：经 Knowledge Hub 向量匹配后 **跳过 LLM**，直接返回标准答（目标：几十～百 ms 量级，视 MCP RTT）。  
3. **分层**：FAQ 语料与向量索引在 **knowledge-hub**；本仓只做 MCP 适配、阈值短路与可审计事件。

**硬约束**

- 生产仍为 PostgreSQL + Redis + `MQ_ENABLED=true` + Better Auth。  
- 遵守 `AGENTS.md`：Wiki/RAG/向量归 knowledge-hub；本仓不新建 FAQ 向量表。  
- 降级可审计（`faq.miss` / `faq.error` / `faq.unavailable`）；**禁止**低分静默当命中。  
- 配置变更三处同步：`FrameworkConfig` / `loadConfig` / `.env.example`。

**明确不做（本期）**

- 本仓 pgvector FAQ 表  
- 历史问答自动缓存作默认主路径  
- design / table 模式 FAQ 短路  
- 多机 FAQ 专用服务（KH 已有则复用）

---

## 2. 问题陈述

### 2.1 伪流式

生产 query 已有 SSE（`/execute/stream` → Redis event store），但 `LangGraphAgentAdapter` 对 LLM `stream()` 结果做 **`aggregateStream`**，整轮完成后才 yield 一个大 `chunk`。  
`settings.streamingEnabled` 仅 UI 存盘，**后端执行链不读**。

结果：用户看到的「首字」≈ 整轮生成结束（若先工具调用则更晚），TTFT 差。

### 2.2 无 FAQ 短路

QueryAgent 即使面对高频固定问答，仍走完整 LLM + 工具链，与 80 人并发排队叠在一起，体验不可接受。

---

## 3. 关键决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| FAQ 语料位置 | Knowledge Hub | 符合分层；运营可在 KH 维护 |
| 本仓职责 | `kb_faq_match` + 阈值短路 + 审计 | 不复制向量基建 |
| 短路挂点 | `executeQueryStream` 在创建 QueryAgent **之前** | 最早跳过 LLM；易测 |
| 流式 | Token 边生成边发 SSE `chunk` | 真正降 TTFT |
| `streamingEnabled` | 接线生效，默认 true | 消除假开关 |
| KH 工具缺失 | no-op → 现有 QueryAgent | 不阻塞主链 |
| 命中阈值默认 | `0.85`（可配） | 保守，避免错答 |

---

## 4. Knowledge Hub 契约

### 4.1 工具：`kb_faq_match`

**入参（JSON）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 用户原问 |
| `top_k` | number? | 默认 1 |
| `min_score` | number? | 可选；本仓仍以本地阈值为准二次校验 |

**出参（JSON）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `hit` | boolean | 是否建议命中 |
| `score` | number | 相似度（与 KH 约定同一度量，如 cosine） |
| `answer` | string? | 标准答；`hit=true` 时必填非空 |
| `faq_id` | string? | 审计 |
| `question` | string? | 命中的标准问 |
| `project_id` | string? | 项目/租户 |

KH 负责：FAQ CRUD、embedding、按项目隔离、索引更新。  
本仓 **不** 实现 FAQ 存储。

### 4.2 对接说明

- 工具名落入现有 `MCP_DEFAULT_EXPOSE_PREFIXES=kb_` 即可被发现。  
- Query 快路径应 **显式调用** `kb_faq_match`（不必等 LLM 选工具）。  
- 调用经现有 MCP 客户端 + 韧性包装；超时/错误 → 视为 miss。

若 KH 尚未发布该工具：本仓探测工具注册表无 `kb_faq_match` 时记 `faq.unavailable`，直接走 QueryAgent。

---

## 5. 本仓 Query 快路径

### 5.1 流程

```text
executeQueryStream(requirement, ...)
  yield start
  try kb_faq_match(requirement)   // 若工具存在
  if hit && score >= FAQ_HIT_THRESHOLD && answer.trim():
      yield { type: "faq_hit", data: { score, faq_id, question } }  // 或复用现有扩展事件名
      yield { type: "chunk", data: { text: answer } }
      yield { type: "complete", data: { ... , source: "faq" } }
      return
  // else: existing QueryAgent + token streaming
```

事件名以实现时与前端兼容为准：优先复用 `chunk` / `complete`；`faq_hit` 可为新增可选事件（前端可忽略）。

### 5.2 阈值与安全

- `FAQ_HIT_THRESHOLD`（默认 `0.85`）：仅当 `score >= threshold` **且** `answer` 非空才短路。  
- KH 返回 `hit=true` 但分数低于本仓阈值 → **按 miss**。  
- 禁止拼接未校验的多条 FAQ 当答案（本期 top_1）。

### 5.3 与 inflight / 队列

- FAQ 命中路径应 **极短**（一次 MCP + 写事件），减少占用 `QUERY_MAX_INFLIGHT` 的时间。  
- 不因此引入过载 429 或中途杀 LLM（与既有 SLA 策略一致）。  
- 可选后续：FAQ 快路径不计入 LLM inflight（P2，非本期必须）。

### 5.4 观测

| Span / 日志 | 何时 |
|-------------|------|
| `faq.hit` | 短路成功 |
| `faq.miss` | 调用成功但未达阈值或无 answer |
| `faq.error` | MCP/解析失败 |
| `faq.unavailable` | 工具未注册 |

---

## 6. 真流式 TTFT

### 6.1 改动点

`src/adapter/langgraph/LangGraphAgentAdapter.ts`（及必要的 EventBus / StreamEmitter 桥接）：

- LLM 节点对 `bound.stream()`：**按 token/delta 向上游推送**文本 `chunk`（经现有 Worker → event store → SSE）。  
- 不再以「整轮 `aggregateStream` 后单次大 `chunk`」作为唯一文本出口。  
- 工具轮次：保持 `tool_start` / `tool_complete`；最终自然语言轮次 token 流式。  
- 聚合仍可用于内部状态机得到完整 `AIMessage`（工具解析、结束判定），但 **用户可见文本不得等聚合结束才首次出现**。

### 6.2 `streamingEnabled`

- 后端读取 settings / config：为 `false` 时可退回整段推送（兼容）。  
- 默认 `true`。  
- 与 UI 开关一致，消除假配置。

### 6.3 前端

现有 `chunk` 追加逻辑（`frontend/lib/streamHandler.ts`）应已够用；仅回归验证。若新增 `faq_hit`，可选展示「来自知识库 FAQ」标签（非阻塞）。

---

## 7. 配置项（须三处同步）

| 变量 | 建议默认 | 含义 |
|------|----------|------|
| `FAQ_FASTPATH_ENABLED` | `true` | 总开关 |
| `FAQ_HIT_THRESHOLD` | `0.85` | 本仓命中阈值 |
| `FAQ_MATCH_TOOL` | `kb_faq_match` | MCP 工具名 |
| `FAQ_MATCH_TIMEOUT_MS` | `2000` | 单次匹配超时 |

流式相关：复用或明确 `streamingEnabled`（settings）与文档说明。

---

## 8. 分期与验收

| 期 | 内容 | 验收 |
|----|------|------|
| **P0a** | 真流式 token → SSE | 单次 query：首个文本 `chunk` 早于整轮结束；人工/集成可观测 TTFT 下降 |
| **P0b** | FAQ 短路（工具存在时） | 构造 mock MCP 返回高分 answer → 无 LLM 调用且 `completed`；低分不短路 |
| **P0c** | KH 实现 `kb_faq_match` + FAQ 数据 | 另一仓；本仓联调文档 |
| **P1** | 指标与提示词 | hit rate / TTFT；`query_knowledge.md` 简述 FAQ 短路 |
| **P2** | 可选：命中不占 LLM inflight；回写审核流 | 增强 |

**测试（本仓）**

- 单元：阈值边界；工具缺失；超时；空 answer。  
- 适配器：stream 路径至少发出 ≥2 个文本 chunk（mock 模型多 delta）。  
- 不强制默认 `loadtest:all` 烧真 LLM。

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| KH 未就绪 | `faq.unavailable` 降级 |
| 错答（阈值过低） | 默认 0.85；运营可调高 |
| 流式打爆 event store | 沿用现有 `eventMaxLength`；可考虑合并极小 delta（实现时权衡 TTFT） |
| 双源答案不一致 | FAQ 以 KH 标准答为准；未命中再 Agent |

---

## 10. 相关文档

- 有界并行：`docs/superpowers/specs/2026-08-07-single-node-query-throughput-design.md`  
- 压测：`docs/superpowers/reports/2026-08-07-loadtest-*.md`  
- 提示词：`prompts/query_knowledge.md`

---

## 11. Spec 自检

- [x] 无 TBD 冒充已定（P2 标为可选）  
- [x] 与用户选择「A = FAQ 在 KH」一致  
- [x] 真流式与 FAQ 范围收束；不做本仓向量表  
- [x] 配置三处同步已列出  
- [x] 降级可审计，禁止静默低分命中  
