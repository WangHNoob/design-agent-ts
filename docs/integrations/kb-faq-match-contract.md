# Knowledge Hub：`kb_faq_match` 对接契约

> **受众**：knowledge-hub 仓实现方  
> **消费方**：design-agent-ts Query 快路径（`executeQueryStream` 在创建 QueryAgent **之前**显式调用）  
> **状态**：P0c — KH 侧待实现；本仓已提供解析与阈值短路逻辑

---

## 1. 工具概览

| 项 | 值 |
|----|-----|
| **工具名** | `kb_faq_match`（可通过 design-agent-ts 环境变量 `FAQ_TOOL_NAME` 覆盖） |
| **暴露方式** | 纳入现有 MCP 前缀 `kb_`（如 `MCP_DEFAULT_EXPOSE_PREFIXES=kb_`） |
| **调用方** | design-agent-ts **不经过 LLM 选工具**，由 Director 直接 `tool.execute(...)` |
| **职责边界** | KH 负责 FAQ CRUD、embedding、向量检索、项目/租户隔离；本仓只做 MCP 适配、本地阈值二次校验与审计事件 |

---

## 2. 请求（入参 JSON）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 用户原问（与 Query 请求的 `requirement` 一致） |
| `top_k` | number | 否 | 返回候选条数；design-agent-ts 固定传 **`1`**（本期仅 top-1 短路） |
| `min_score` | number | 否 | KH 侧可选预过滤阈值；**本仓仍以本地 `FAQ_THRESHOLD` 为准做二次校验**，KH 的 `min_score` 不能替代本仓阈值 |

### 请求示例

```json
{
  "query": "荣耀连战是什么玩法？",
  "top_k": 1
}
```

---

## 3. 响应（出参 JSON）

工具应通过 MCP 返回可解析的 JSON（字符串或结构化对象均可；本仓 `parseFaqMatchResult` 亦支持 `ToolResult.output` 字符串）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hit` | boolean | 是 | KH 是否建议命中（语义匹配成功） |
| `score` | number | 是 | 相似度分数，与 KH 索引度量一致（建议 **cosine similarity，范围 0～1**） |
| `answer` | string | 条件 | 标准答案；当 `hit=true` 时 **必须为非空字符串** |
| `faq_id` | string | 否 | FAQ 记录 ID，供审计与 `faq_hit` 事件 |
| `question` | string | 否 | 命中的标准问句（canonical question） |
| `project_id` | string | 否 | 项目/租户标识（多租户隔离时建议返回） |

### 字段映射（本仓内部）

本仓解析时接受 snake_case 与 camelCase：

- `faq_id` → `faqId`
- `project_id` → `projectId`

### 命中响应示例

```json
{
  "hit": true,
  "score": 0.91,
  "answer": "荣耀连战是……（标准答全文）",
  "faq_id": "faq_honor_chain_battle",
  "question": "什么是荣耀连战？",
  "project_id": "proj_demo"
}
```

### 未命中响应示例

```json
{
  "hit": false,
  "score": 0.42
}
```

---

## 4. 阈值与短路规则（本仓二次校验）

KH 返回的结果 **不等于** 最终是否短路。design-agent-ts 使用纯函数 `decideFaqHit` 判定：

| 条件 | 结果 |
|------|------|
| 工具未注册 / 调用超时 / 解析失败 | 视为 miss，降级走 QueryAgent + LLM（日志：`faq.unavailable` / `faq.error`） |
| `hit === false` | miss（`provider_miss`） |
| `score < FAQ_THRESHOLD` | miss（`below_threshold`），**即使 KH 返回 `hit=true` 也不短路** |
| `answer` 为空或仅空白 | miss（`empty_answer`） |
| `hit === true` 且 `score >= FAQ_THRESHOLD` 且 `answer.trim()` 非空 | **短路**：跳过 LLM，SSE 推送 `faq_hit` + `chunk` + `complete`（`source: "faq"`） |

### 相关环境变量（design-agent-ts）

| 变量 | 建议默认 | 含义 |
|------|----------|------|
| `FAQ_ENABLED` | `false`（联调后开启） | 快路径总开关 |
| `FAQ_THRESHOLD` | `0.82`～`0.85` | 本仓命中阈值（保守，避免错答） |
| `FAQ_TIMEOUT_MS` | `800`～`2000` | 单次 MCP 匹配超时（毫秒），超时视为 miss |
| `FAQ_TOOL_NAME` | `kb_faq_match` | 工具名 |

**禁止**：低分或空答案静默当作命中。

---

## 5. 超时与韧性

- design-agent-ts 对单次 `kb_faq_match` 使用 **`Promise.race`**：`FAQ_TIMEOUT_MS` 内未返回则视为 miss，继续 QueryAgent 主链。
- 工具错误（`ToolResult.isError`）或 JSON 解析失败 → 返回 `null`，不阻塞用户请求。
- 调用经现有 MCP 客户端与工具韧性包装（与 `kb_search` 等一致）。

---

## 6. KH 实现要点（P0c 验收）

1. 提供 MCP 工具 `kb_faq_match`，入参/出参符合上文 schema。  
2. FAQ 语料与向量索引在 KH 维护；支持按 `project_id` / 租户隔离。  
3. `hit=true` 时保证 `answer` 非空；`score` 与 KH 文档中的相似度定义一致。  
4. 联调：mock 或真实返回 `score >= FAQ_THRESHOLD` → design-agent-ts 无 LLM 调用且 SSE 含 `faq_hit`；低分不短路。

---

## 7. 相关文档

- 设计 spec：`docs/superpowers/specs/2026-08-08-query-streaming-faq-fastpath-design.md` §4  
- 本仓解析：`src/core/faq/parseFaqMatchResult.ts`  
- 本仓阈值：`src/core/faq/decideFaqHit.ts`  
- 组装与超时：`src/server/bootstrap.ts` → `buildDirectorStreamingAndFaqDeps`
