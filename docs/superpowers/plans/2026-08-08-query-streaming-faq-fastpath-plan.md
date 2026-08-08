# Query 真流式 TTFT + KH FAQ 短路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Query 路径实现 LLM token 级 SSE 推送以降低 TTFT，并在 Knowledge Hub `kb_faq_match` 命中时跳过 LLM 直接返回答案。

**Architecture:** （1）`AgentProcessOptions.onTextDelta` 贯穿 LangGraph `aggregateStream`，Director 写入 EventBus `chunk`；（2）纯函数 `decideFaqHit` + `DirectorDeps.faqFastPath`，在 `executeQueryStream` 创建 Agent 前调用 MCP 工具；工具缺失/失败则降级。向量与 FAQ 语料仍在 knowledge-hub。

**Tech Stack:** TypeScript、Vitest、现有 SSE/EventBus、MCP ToolRegistry、LangGraph stream chunks。

**Spec:** `docs/superpowers/specs/2026-08-08-query-streaming-faq-fastpath-design.md`

**范围说明:** 本计划仅覆盖 **本仓 P0a/P0b**。KH 实现 `kb_faq_match` 为 **P0c（另一仓）**，本仓提供契约文档与 mock 测试。

---

## File map

| 文件 | 职责 |
|------|------|
| `src/port/agent/AgentPort.ts` | `onTextDelta` / 可选 `streamingEnabled` 选项 |
| `src/adapter/langgraph/LangGraphAgentAdapter.ts` | stream 时按 delta 回调；尊重 streaming 开关 |
| `src/core/faq/decideFaqHit.ts` | 阈值判定纯函数 |
| `src/core/faq/types.ts` | FAQ 匹配结果类型 |
| `src/core/agent/director/DirectorAgent.ts` | FAQ 快路径；StreamEvent `faq_hit`；接线 onTextDelta |
| `src/config/*` + `.env.example` | FAQ_* 配置 |
| `src/server/bootstrap.ts` | 组装 `faqFastPath.match`（ToolRegistry → `kb_faq_match`） |
| `src/core/settings/SettingsManager.ts` + bootstrap | `streamingEnabled` 注入执行链 |
| `prompts/query_knowledge.md` | 简述 FAQ 短路 |
| `docs/integrations/kb-faq-match-contract.md` | KH 对接契约 |
| `test/core/faq/decideFaqHit.test.ts` | 阈值单测 |
| `test/adapter/langgraph/LangGraphAgentAdapter.stream-delta.test.ts` | delta 回调测 |
| `test/core/agent/director/DirectorAgent.faq.test.ts` | FAQ 短路测 |

---

### Task 1: FAQ 判定纯函数（core）

**Files:**
- Create: `src/core/faq/types.ts`
- Create: `src/core/faq/decideFaqHit.ts`
- Create: `test/core/faq/decideFaqHit.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, test } from "vitest";
import { decideFaqHit } from "../../../src/core/faq/decideFaqHit.js";

describe("decideFaqHit", () => {
  test("hit when score >= threshold and answer non-empty", () => {
    expect(
      decideFaqHit(
        { hit: true, score: 0.9, answer: "标准答", faqId: "f1", question: "Q" },
        0.85,
      ),
    ).toEqual({
      ok: true,
      score: 0.9,
      answer: "标准答",
      faqId: "f1",
      question: "Q",
    });
  });

  test("miss when score below local threshold even if provider hit", () => {
    expect(
      decideFaqHit({ hit: true, score: 0.7, answer: "x" }, 0.85),
    ).toEqual({ ok: false, reason: "below_threshold" });
  });

  test("miss when answer empty", () => {
    expect(
      decideFaqHit({ hit: true, score: 0.99, answer: "  " }, 0.85),
    ).toEqual({ ok: false, reason: "empty_answer" });
  });

  test("miss when provider hit false", () => {
    expect(
      decideFaqHit({ hit: false, score: 0.99, answer: "x" }, 0.85),
    ).toEqual({ ok: false, reason: "provider_miss" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`pnpm exec vitest run test/core/faq/decideFaqHit.test.ts`

- [ ] **Step 3: Implement**

```typescript
// types.ts
export interface FaqMatchRaw {
  readonly hit: boolean;
  readonly score: number;
  readonly answer?: string;
  readonly faqId?: string;
  readonly question?: string;
  readonly projectId?: string;
}

export type FaqDecision =
  | { readonly ok: true; readonly score: number; readonly answer: string; readonly faqId?: string; readonly question?: string }
  | { readonly ok: false; readonly reason: "provider_miss" | "below_threshold" | "empty_answer" | "invalid" };

// decideFaqHit.ts
export function decideFaqHit(raw: FaqMatchRaw | null | undefined, threshold: number): FaqDecision {
  if (!raw || typeof raw.score !== "number" || Number.isNaN(raw.score)) {
    return { ok: false, reason: "invalid" };
  }
  if (!raw.hit) return { ok: false, reason: "provider_miss" };
  if (raw.score < threshold) return { ok: false, reason: "below_threshold" };
  const answer = (raw.answer ?? "").trim();
  if (!answer) return { ok: false, reason: "empty_answer" };
  return { ok: true, score: raw.score, answer, faqId: raw.faqId, question: raw.question };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/core/faq test/core/faq
git commit -m "feat: add decideFaqHit for FAQ fast-path thresholding"
```

---

### Task 2: FAQ 配置三处同步

**Files:**
- Modify: `src/config/FrameworkConfig.ts`
- Modify: `src/config/loadConfig.ts`
- Modify: `src/config/validateConfig.ts`
- Modify: `.env.example`
- Modify: `test/config/validateConfig.test.ts`（fixture）

在合适配置块新增（建议独立 `faq:` 或挂 `execution` 旁；与现有风格一致即可）：

```typescript
faq: {
  fastPathEnabled: boolean;      // FAQ_FASTPATH_ENABLED default true
  hitThreshold: number;          // FAQ_HIT_THRESHOLD default 0.85
  matchTool: string;             // FAQ_MATCH_TOOL default kb_faq_match
  matchTimeoutMs: number;        // FAQ_MATCH_TIMEOUT_MS default 2000
};
```

校验：`hitThreshold` ∈ (0,1]；`matchTimeoutMs` 正整数；`matchTool` 非空。

- [ ] **Step 1–4:** 改配置 → 补 validate 测 → `pnpm exec vitest run test/config/validateConfig.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add FAQ fast-path config knobs"
```

---

### Task 3: Token delta 回调（port + LangGraph）

**Files:**
- Modify: `src/port/agent/AgentPort.ts`
- Modify: `src/adapter/langgraph/LangGraphAgentAdapter.ts`
- Create: `test/adapter/langgraph/LangGraphAgentAdapter.stream-delta.test.ts`

- [ ] **Step 1: Extend options**

```typescript
export interface AgentProcessOptions {
  signal?: AbortSignal;
  /** When set, called with each text delta during LLM streaming (TTFT). */
  onTextDelta?: (delta: string) => void;
  /** When false, suppress onTextDelta and only return final aggregated message. Default true. */
  streamingEnabled?: boolean;
}
```

- [ ] **Step 2: Failing test**

用现有 LangGraphAgentAdapter 测试夹具风格：mock `getLangChainModel().bindTools().stream` 产出多个带 `content: "a"` / `"b"` 的 chunk；构造 adapter；`process` 或直接测内部——优先通过公开 `processStream`/`process` 路径传入 `onTextDelta`，断言回调收到 `["a","b"]`（或拼接 `"ab"`）。

若现有测试难注入 model，可导出/测试 `aggregateStream` 行为：为 `aggregateStream` 增加可选第二参 `onTextDelta`（private 则通过 process 路径测）。

- [ ] **Step 3: Implement in `aggregateStream`**

在 `for await (const chunk of chunks)` 循环内，当追加 `textContent` 或 block `text` 时，若 `onTextDelta` 存在且 `streamingEnabled !== false`，对**本次新增**字符串调用 `onTextDelta(delta)`（注意 Anthropic block 合并时只传增量，避免重复整段）。

将 `invokeLlm` / `llmCall` 改为接收并向下传递 `options?.onTextDelta`（从 `process` / `processStream` 的 `AgentProcessOptions` 经闭包或 `this._activeStreamOptions` 传入——**优先显式参数**，避免跨请求污染；`buildGraph` 若闭包难传，可用 `AsyncLocalStorage` 或在每次 `process*` 开始时设置 `this.currentProcessOptions` 并在 finally 清空）。

推荐最小侵入：

```typescript
private currentProcessOptions: AgentProcessOptions | undefined;

async process(...) {
  this.currentProcessOptions = options;
  try { ... } finally { this.currentProcessOptions = undefined; }
}
// invokeLlm 内:
const onDelta = this.currentProcessOptions?.streamingEnabled === false
  ? undefined
  : this.currentProcessOptions?.onTextDelta;
return aggregateStream(stream, onDelta);
```

- [ ] **Step 4: Tests PASS；既有 LangGraphAgentAdapter 测不回归**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: emit LLM text deltas via onTextDelta for TTFT"
```

---

### Task 4: Director 接线真流式 chunk

**Files:**
- Modify: `src/core/agent/director/DirectorAgent.ts`（`executeQueryStream`）
- Modify tests if Director stream tests exist

- [ ] **Step 1:** 在 `executeQueryStream` 调用 `processStream` 时：

```typescript
let streamed = "";
const streamingEnabled = options?.executionOverrides /* or deps */ ?? this.deps.streamingEnabled ?? true;

for await (const response of agent.processStream(sessionId, messages, {
  signal,
  streamingEnabled,
  onTextDelta: (delta) => {
    streamed += delta;
    eventBus.emit({ type: "chunk", data: { text: delta } });
  },
})) {
  for (const event of eventBus.drain()) yield event;
  // ...
  const text = response.message ? ChatMessage.textContent(response.message) : "";
  if (text) {
    finalOutput = text; // 完整最终文本以聚合结果为准
    // 避免重复推送已流式发出的前缀：
    if (!streamingEnabled || !streamed) {
      yield { type: "chunk", data: { text } };
    } else if (text.length > streamed.length && text.startsWith(streamed)) {
      yield { type: "chunk", data: { text: text.slice(streamed.length) } };
    }
    // 若 streamed 已覆盖 text，不再 yield 大 chunk
  }
}
```

将 `streamingEnabled` 加入 `DirectorDeps`（由 bootstrap 从 settings 注入）。

- [ ] **Step 2:** 跑相关 Director / integration 测

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: forward token deltas to query SSE via EventBus"
```

---

### Task 5: FAQ 快路径接入 Director

**Files:**
- Modify: `src/core/agent/director/DirectorAgent.ts`
- Create: `test/core/agent/director/DirectorAgent.faq.test.ts`

扩展 `StreamEvent.type` 联合类型：加入 `"faq_hit"`。

`DirectorDeps` 增加：

```typescript
faqFastPath?: {
  enabled: boolean;
  threshold: number;
  match: (query: string) => Promise<FaqMatchRaw | null>;
};
```

在 `executeQueryStream`，`yield start` 之后、`createQueryAgentWithHooks` 之前：

```typescript
const fp = this.deps.faqFastPath;
if (fp?.enabled) {
  try {
    const raw = await fp.match(requirement);
    const decision = decideFaqHit(raw, fp.threshold);
    if (decision.ok) {
      console.log(`[DirectorAgent] faq.hit score=${decision.score} faqId=${decision.faqId ?? ""}`);
      yield {
        type: "faq_hit",
        data: { score: decision.score, faqId: decision.faqId, question: decision.question },
      };
      yield { type: "chunk", data: { text: decision.answer } };
      yield { type: "complete", data: { success: true, output: decision.answer, source: "faq" } };
      return;
    }
    console.log(`[DirectorAgent] faq.miss reason=${decision.reason}`);
  } catch (err) {
    console.warn(`[DirectorAgent] faq.error`, err);
  }
}
```

- [ ] **Step 1: 测试**

- mock `faqFastPath.match` 返回高分 → 不创建 agent（可用计数器 spy factory）且事件含 `faq_hit` + `complete.source=faq`  
- 低分 → 仍调用 agent（可用 stub agent）

因 Director 构造较重，可提取 `tryFaqFastPath(requirement, fp): AsyncGenerator | null` 纯逻辑测，或轻量 stub deps。

- [ ] **Step 2: 实现 + PASS**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: short-circuit query stream on FAQ match"
```

---

### Task 6: bootstrap 组装 FAQ matcher + streamingEnabled

**Files:**
- Modify: `src/server/bootstrap.ts`（所有构造 `DirectorAgent` 处）

```typescript
faqFastPath: {
  enabled: config.faq.fastPathEnabled,
  threshold: config.faq.hitThreshold,
  match: async (query: string) => {
    const tool = toolRegistry.getTool(config.faq.matchTool);
    if (!tool) {
      console.log("[Bootstrap/Director] faq.unavailable tool missing");
      return null;
    }
    const result = await Promise.race([
      tool.execute({ query, top_k: 1 }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), config.faq.matchTimeoutMs),
      ),
    ]);
    if (!result || result === null) return null;
    // parse ToolResult.content JSON → FaqMatchRaw（字段映射 faq_id→faqId）
    ...
  },
},
streamingEnabled: settings.streamingEnabled !== false,
```

解析 MCP/工具返回时要容错：content 为 JSON 字符串或已是对象；失败返回 `null`。

- [ ] **Step 1:** 实现解析 helper（可放 `src/core/faq/parseFaqMatchResult.ts`）+ 单测

- [ ] **Step 2:** 接线 bootstrap；确保 `reloadDirector` / late bootstrap 同样注入

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: wire FAQ matcher and streamingEnabled in bootstrap"
```

---

### Task 7: 契约文档 + 提示词

**Files:**
- Create: `docs/integrations/kb-faq-match-contract.md`（从 spec §4 摘录入参/出参，供 KH 仓实施）
- Modify: `prompts/query_knowledge.md`（文首增加：系统可能已对高频问做 FAQ 短路；未短路时仍按原流程）

- [ ] **Commit**

```bash
git commit -m "docs: add kb_faq_match contract and query prompt note"
```

---

### Task 8: 全量验证

- [ ] `pnpm lint`（本分支新增文件不引入分层违规）
- [ ] `pnpm test`
- [ ] `pnpm run build`
- [ ] 更新 spec 状态为「本仓 P0 已实现 / 待 KH P0c」
- [ ] Commit docs if needed

---

## Spec coverage

| Spec 项 | Task |
|---------|------|
| Token 级 SSE | 3, 4 |
| `streamingEnabled` 接线 | 4, 6 |
| `decideFaqHit` / 阈值 | 1 |
| FAQ 配置 | 2 |
| `executeQueryStream` 短路 | 5 |
| bootstrap + MCP 工具 | 6 |
| KH 契约文档 | 7 |
| 工具缺失降级 | 5, 6 |
| KH 实现 FAQ 库 | **不在本计划**（P0c） |

## 风险备注

- Anthropic 流式 content 可能是 block 数组：增量提取必须测到，避免首字重复/丢失。  
- FAQ 与真流式可并行开发但合并时注意 `executeQueryStream` 冲突。  
- 干净重建 `dist/` 后再 live 验证。
