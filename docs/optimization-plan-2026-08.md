# 生产级硬化优化计划（2026-08-08）

> 依据 2026-08-08 全仓审计（分层架构核查 × 服务端/适配器核查 × 测试/评估/压测核查 × 2026 行业最佳实践调研 × Mimosa L3 深度扫描）制定。
> 范围：**不含 CI**（用户明确排除）。所有改动在 `feat/production-hardening` 分支上分阶段提交，每阶段 `pnpm build && pnpm test` 验证。

## 阶段 2 — P0 生产缺陷（已批准）

| # | 项 | 位置 | 修复 |
|---|----|------|------|
| P0-1 | CORS 忽略 `TRUSTED_ORIGINS` | `src/server/app.ts:47-62` | origin 回调读取配置注入的 trusted origins |
| P0-2 | 无优雅停机 | `src/server/main.ts` | SIGTERM/SIGINT → 停 worker、关 MQ/事件存储/Redis/Postgres，超时兜底 |
| P0-3 | Tavily 无 key 静默成功 | `src/adapter/tavily/TavilySearchTool.ts:49-51` | 无 key 不注册工具（bootstrap 判断） |
| P0-4 | `auditLoginOnce` 无限去重集 | `src/server/security/auditHelpers.ts:34-45` | TTL 淘汰 |
| P0-5 | DLQ 无保留策略 | `src/adapter/redis/RedisMessageQueueAdapter.ts:415-432` | `DLQ_RETENTION_DAYS` + 定期 trim + 日志 |

## 阶段 3 — P1 架构债

| # | 项 | 位置 | 内容 |
|---|----|------|------|
| P1-1 | 死代码清理 | 见下文清单 | 删无生产消费者的文件 + barrel 死导出 |
| P1-2 | 14 个硬编码常量配置化 | core/server/adapter | FrameworkConfig + loadConfig + .env.example 三处同步 |
| P1-3 | Director 构造三份拷贝 | `bootstrap.ts:1116/224/1238` | 提取 `buildDirector()` |
| P1-4 | `executeSingleTask` 重复 | `DirectorAgent.ts:940-1181` | 参数化 hooks 合并 |
| P1-5 | FAQ 路径缺观测 | `DirectorAgent.ts:1546-1565` | console.log → logger；打 faq span |
| P1-6 | 配置死键 | FrameworkConfig/loadConfig | 删 `messageQueue.enabled`、`versioning.snapshotTtlMs`、`hitl.maxRevisionRounds` 重复读取 |

### P1-1 死代码清单（删除前逐项验证 test 依赖）

**删（含专属测试）**：
- `src/adapter/langgraph/LangGraphDirectorGraph.ts` + `.test.ts`（2026-06-04 起无生产引用）
- `src/adapter/langgraph/LangGraphHookAdapter.ts` + `.test.ts`
- `src/adapter/langgraph/LangGraphSessionAdapter.ts` + `.test.ts`（生产用 PostgresSessionRepository）
- `src/adapter/memory/FileBasedLongTermMemoryAdapter.ts`（零引用）
- `src/core/hitl/HITLManager.ts`（被 DurableHumanReviewGateway 取代）
- `src/core/session/SessionManager.ts`（零引用）
- `src/core/agent/subagents/{CombatDesigner,SystemDesigner,GameplayDesigner,NumericalPlanner,ExecutivePlanner,QAPlanner}.ts`（4 行 shim）
- barrel 死导出：`src/adapter/langgraph/index.ts`、`src/index.ts:89`（SessionPort type）

**保留**（测试在用）：`InMemoryAuditStore`、`InMemoryTenantIsolationAdapter`、`InMemoryCostStore`、`InMemorySlidingWindowLimiter`、`MockToolAdapter`

### P1-2 常量清单

| 常量 | 位置 | 默认 | 目标配置键 |
|------|------|------|-----------|
| IN_FLIGHT_PARTIAL_OUTPUT_TIMEOUT_MS | `core/pipeline/PlanPipeline.ts:41` | 2000ms | `execution.inFlightPartialOutputTimeoutMs` |
| drain 轮询 | `core/agent/director/DirectorAgent.ts:1499` | 200ms | `execution.eventDrainIntervalMs` |
| handoff 上限 | `DirectorAgent.ts:319-321` | 4000/12/12000 | `multiAgent.handoffMaxChars/KeyPoints/TotalChars` |
| DEFER_BACKOFF_MS | `server/worker/ExecutionWorker.ts:70` | 75ms | `queue.deferBackoffMs` |
| 需求字符上限 | `server/routes/console.ts:70` | 50000 | `console.maxRequirementChars` |
| SSE 重放上限 | `console.ts:358-361` | 1000 | `console.sseReplayLimit` |
| SSE 心跳兜底 | `console.ts:339` | 15000ms | `execution.sseHeartbeatMs`（补 FrameworkConfig 键） |
| 黑板 evict 间隔 | `server/bootstrap.ts:555` | 60000ms | `execution.blackboardEvictIntervalMs` |
| HITL sweep batch | `bootstrap.ts:956` | 50 | `hitl.sweepBatchSize` |
| 审阅锁 TTL | `server/routes/hitl.ts:171` | 30000ms | `hitl.reviewLockTtlMs` |
| Redis 锁参数 | `adapter/redis/RedisTenantIsolationAdapter.ts:13-18` | 5s/30s/10 | `redis.lockWaitTimeoutMs/ttlMs/retries` |
| 租户缓存 EX | `RedisTenantIsolationAdapter.ts:80` | 300s | `redis.tenantContextCacheTtlSeconds` |
| 并发槽 TTL | `RedisTenantIsolationAdapter.ts:202` | 3600s | `redis.concurrencySlotTtlSeconds` |
| 会话 7d/1d | `adapter/betterauth/BetterAuthAdapter.ts:188-189` | 7d/1d | `auth.sessionTtlSeconds/refreshTtlSeconds` |
| SETTINGS_DIR | `core/settings/SettingsManager.ts:40` | env | 改为 bootstrap 注入 baseDir |

## 阶段 4 — P2 工程化

| # | 项 | 内容 | 状态 |
|---|----|------|------|
| P2-1 | Eval 真实化 | `scripts/run-online-eval.ts`（真实 judge + 真实 DirectorAgent）；数据集 3→11 用例；EvalRunner 跳过无 baseline 的 metric；`pnpm eval:online` | ✅ 已实施（`a7962d5`） |
| P2-2 | 组装层测试 | HITL approve→resume→completed 全流程（真实 route+service+worker）；SSE resume/重放已有 Last-Event-ID 测试覆盖，bootstrap smoke 与现有集成测试重叠故未重复 | ✅ 已实施（`1d19d99`） |
| P2-3 | 时序测试修复 | `vi.useFakeTimers` 替换真实 sleep（约 8 处） | ⏳ 延期：被测代码本身依赖 setTimeout 轮询，替换需逐个小心推进；已在评估报告中列为已知技术债（含 file:line） |
| P2-4 | loadtest 补丁 | 07-query-llm per-check 计数 + handleSummary 明细；README 记录 08-08 smoke 0.667 检查率与 LLM 空响应根因；TTFT 由 `scripts/probe-query-sse-ttft.mjs` 承担（k6 http.get 缓冲整响应，无法精确测首 chunk 时间） | ✅ 已实施（下文提交） |

## 阶段 5 — 收尾

1. 6-04 设计稿标注**已否决**（保留 Integrator 聚合与 HITL-2/3）
2. 变更涉及文档同步
3. 全量验证：`pnpm build && pnpm test && pnpm lint`
4. no-ff 合并回 main 并推送
5. 恢复 `MIMOSA_GIT_GATE_MODE=strict`

## 验证标准（每阶段）

- [ ] `pnpm run build` 通过
- [ ] `pnpm test` 全部通过
- [ ] 架构自查：`pnpm lint` 通过（no-restricted-imports 分层规则）
- [ ] 新配置项三处同步（FrameworkConfig / loadConfig / .env.example）
