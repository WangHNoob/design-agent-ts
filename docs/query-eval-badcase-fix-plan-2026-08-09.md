# 查询评测 badcase 修复方案（Agent 端，2026-08-09）

> 依据：78 题 v0.2 查询模式评测（75.6 分，18 FAIL）的失败归因 + trace 级证据链。
> 范围：**仅 design-agent-ts**。knowledge-hub 侧（工具返回体/token 优化）由另一任务并行处理，见 `knowledge-hub/docs/optimization-task-prompt.md`。
> 状态：**已批准并完成实施**（2026-08-09，提交 `bb7162e`，分支 `fix/query-eval-badcases`）。
> P2-5 压缩时机提前经用户确认**撤销**；其余 P0-1/P0-2/P1-3/P1-4/P2-6 已实现，`pnpm build`/`pnpm test`（96 文件 476 用例）/`pnpm lint` 全过。

## 一、排查结论：LLM 重试路径的真相

### 1.1 重试路径本轮 0 次触发，不是失败原因
- 78 题全流程日志统计：same-model 重试 **0 次**、fallback 切换 **0 次**、terminated **0 次**、empty response **0 次**。
- `classifyModelError` + `LangGraphAgentAdapter.llmCall` 的重试循环（fallback promote → 同模型退避 ≤2 次）设计合理且有限，本轮未介入任何失败。

### 1.2 真正的两个根因（trace 级证据）

**根因 A：上下文压缩切断 tool_calls↔ToolMessage 消息对 → provider 400（EV-058）**

日志序列（EV-058 时间窗）：
```
[ContextManagementHook] memory.maybeCompress: 23 → 12 条消息 (归档 1)
[LangGraphAgentAdapter:QueryAgent] LLM invoke failed: 400 ... Messages with role 'tool' must be a response to a preceding message with 'tool_calls'
```
- `ContextManager.compressWithArchive()`（`src/core/memory/ContextManager.ts:94-95`）按**消息条数**滑窗：`recent = active.slice(-10)`，`toEvict = active.slice(0, -10)`。
- 消息条数窗口会**切开一个轮次**：`ai(tool_calls)` 被归档、对应的 ToolMessage 留在 recent → 下一次 LLM 调用时消息序列含"悬空 tool 消息" → provider 400（LangChain 错误码 INVALID_TOOL_RESULTS）。
- 400 被 `classifyModelError` 判 **terminal** → 不重试 → 整题失败。
- 同类风险：`process()` 与 `processStream()` 路径共用同一压缩逻辑；工具结果越长（本轮 KB envelope 普遍 >10k token），越容易触发。

**根因 B：模型无效循环重复调用工具 → 累计 token 打穿 500k 预算（EV-021/027/060/065/071/077）**

EV-021 trace（9 次迭代，输入 11k → 66k，累计 53 万触发 guard）：
```
iter4-8: kb_query_table(ShopItem, limit=40) ×3 → kb_get_table_raw(ShopItem) ×2   ← 连续 5 次重复同一表
```
- QueryAgent `maxIterations=20` 无收敛检测：模型对同一表重复查询（参数几乎相同），每次迭代把全部历史重发给模型，输入单调增长；
- `TokenBudgetHook` 按 trace 累计 input+output（`post_reasoning`），累计超 500k 后 `pre_reasoning` 中止 —— **护栏工作正常，但触发说明循环未被尽早截断**；
- `ContextManager` 阈值（128k×0.7≈89.6k）与消息数窗口（20 条）在本场景**均未触发**（EV-021 输入峰值 66k、消息 ~19 条），压缩形同虚设。

### 1.3 次要发现
- **FAQ 快路径完全未生效**：`kb_faq_match` 未在 knowledge-hub MCP 暴露（34 个工具中无此工具），78/78 次 `faq.unavailable tool missing`。属 knowledge-hub 侧任务。
- EV-060 trace 中 `tool.circuit.kb_query_table` 熔断打开后模型仍继续调用该工具 —— 熔断对模型不可见，无引导。

## 二、优化方案（按优先级）

### P0-1 修复 ContextManager：按"轮次"滑窗，不按消息条数
- 位置：`src/core/memory/ContextManager.ts` `compressWithArchive()`。
- 改法：从后往前按轮次切分消息序列 —— 一个轮次 = `assistant(含 tool_calls)` + 其后跟随的所有 `tool` 消息；`protectRecentTurns` 保护**最近 N 个轮次**，`toEvict` 只取完整轮次。归档/保留边界永不切开消息对。
- 语义影响：同等条件下保留的消息数可能略增（被保护轮次含 tool 消息），token 压缩率略降 —— 可配合 P0-2 的输入上限压缩兜底。
- 测试：新增单测覆盖"tool_calls 跨边界"场景（归档后消息序列合法：每个 tool 消息前必有含对应 tool_call_id 的 assistant 消息）。

### P0-2 消息序列合法性校验（发送前兜底）
- 位置：`LangGraphAgentAdapter.llmCall` 构造 `effectiveMessages` 后、`invokeLlm` 前。
- 改法：`sanitizeMessages(msgs)` 纯函数 —— 扫描 tool 消息，若前一条消息不是含对应 `tool_call_id` 的 assistant(tool_calls)，将该 tool 消息降级为文本（保留内容）或移除；校验 assistant(tool_calls) 的 id 与后续 tool 消息一一对应。
- 价值：即使未来其他路径（重试、摘要注入、FAQ 拼接）再次产生悬空 tool 消息，也不至于整题 400 失败 —— 从"崩溃"降级为"可能丢一条工具结果"。
- 测试：单测覆盖悬空/缺 id/顺序错乱三类输入。

### P1-3 重复工具调用检测（循环守卫，防 token 风暴）
- 位置：core 层新增纯函数守卫（如 `src/core/tool/detectRepeatedToolCalls.ts`，仅依赖 port），`LangGraphAgentAdapter.wrappedToolNode`/`llmCall` 调用。
- 规则（按 trace 内统计）：
  1. 同一 `toolName + 参数规范化哈希` 出现 **≥2 次**：注入 HumanMessage 提示（"该调用已执行且结果未变，禁止重复；基于已有信息作答或换查询角度"）；
  2. 出现 **≥3 次**：走既有 `forceFinalOutput` 强制收敛。
- 参数规范化：JSON 序列化排序键 + 忽略纯格式差异（`"40"` vs `40`）。
- 与 knowledge-hub 侧"工具结果精简"叠加后，正常题不会触顶；此守卫是最后防线，不应依赖预算护栏兜底。
- 测试：单测覆盖同参重复/近参重复/合法换参三场景。

### P1-4 工具结果入上下文前的 token 预算
- 位置：`LangGraphToolAdapter` 或 ToolNode 包装层，对 `ToolMessage.content` 做按字符/token 截断（保留结构头 + 尾部标注 `[截断: 原长 N 字符]`）。
- 默认上限建议 6000~8000 字符/条（可配置 `FrameworkConfig` + `.env.example` 三处同步），KB envelope 经 knowledge-hub 精简后此兜底更少触发。
- 权衡：截断可能丢失模型需要的数值 —— 上限要可配、可审计（span 记录 `truncated` 标记）。

### ~~P2-5 压缩触发时机~~（已撤销，2026-08-09 用户确认）
- ~~建议：`ContextManager` 增加单次调用输入上限强制压缩。~~
- 撤销理由：压缩触发时机保持现状（token 0.7×128k + 消息数 20 条），只修"切轮次"的破坏性，不引入新的强制压缩路径；收敛职责由 P1-3 循环守卫承担。

### P2-6 观测与预算语义（低成本高价值）
- TokenBudgetHook 触发 span 已记录 used/budget；补充记录 `iteration` 与消息数，便于归因"循环" vs "单次超限"。
- 预算语义保持"累计 input+output"（真实成本护栏）；不调高 500k，让 P1-3 承担收敛职责。

## 三、分工边界与预期

| 项 | 负责方 |
|----|--------|
| 工具返回体瘦身 / 双重编码 / kb_list_tables 全量 / kb_faq_match 暴露 / 熔断参数 | knowledge-hub（另一任务） |
| 上下文压缩轮次化 / 序列校验 / 循环守卫 / 工具结果截断 / 压缩时机 / 观测 | design-agent-ts（本方案） |

预期效果（修复后重跑 78 题）：
- EV-058 转 PASS（根因 A 消除，压缩后消息序列合法）；
- 6 题 token 风暴多数转 PASS 或至少从"预算中止"变为"正常出答案"（根因 B 消除）；
- 单题平均 token 消耗显著下降（knowledge-hub 精简 + 本侧截断/守卫双管齐下）；
- 得分预计从 75.6 回到 84+（与 v0.1 回归子集 85 持平）。

## 四、实施顺序与验证

1. P0-1 + P0-2（含单测）→ `pnpm build && pnpm test`；
2. P1-3 + P1-4（含单测）→ `pnpm build && pnpm test`；
3. P2-5/P2-6 → `pnpm build && pnpm test`；
4. 重跑 `run_query_mode_eval.py` 78 题，对比得分与失败归因；
5. 架构自查：新增 core 守卫仅依赖 port/纯函数；配置三处同步；`pnpm lint` 通过。
