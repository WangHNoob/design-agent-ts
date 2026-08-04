# Agent 开发规范

> 本项目是一个与框架完全解耦的多智能体游戏策划系统基座。所有代码修改必须严守分层架构，严防架构腐烂。

---

## 一、核心设计初衷

**与框架完全解耦的 Agent 基座。**

- `src/port/` 定义纯接口（Port），零框架依赖
- `src/core/` 承载框架无关的业务逻辑，仅允许依赖 `port/`
- `src/adapter/` 封装框架具体实现（如 LangGraph），允许依赖 `port/` 和 `core/`
- `src/server/` 是应用组装根（Composition Root），可依赖所有层
- `src/config/` 仅负责配置加载与类型定义，**不得实例化任何 adapter 具体类**

生产运行强制：PostgreSQL、Redis、Better Auth 密钥、`MQ_ENABLED=true`。禁止恢复无认证 / 文件 Session·HITL·LTM / 无 Redis 的生产降级路径。表结构只通过 `drizzle/` 迁移；启动时不得 `initializeSchema()` 建业务表。

---

## 二、分层红线（绝对禁止）

### 1. core 层不得依赖 adapter 层
- **禁止**静态 import adapter 层任何文件
- **禁止**动态 `import()` adapter 层任何文件
- **修正做法**：将框架无关的实现（如 `InMemoryMemoryPort`）移至 `core/`；必须通过构造函数/端口注入依赖

### 2. core 层不得直接操作基础设施
- **禁止**在 `src/core/` 中使用 `fs`、`path`、`fetch` 等基础设施 API
- 文件系统、网络请求、数据库等属于**基础设施**，core 层应通过端口抽象使用
- **修正做法**：
  - 提示词文件读取放在 `server/` 组装根，通过构造函数注入字符串
  - 第三方 HTTP 服务（如 Tavily）放在 `adapter/` 层

**core 依赖白名单**：core 允许的第三方依赖仅 `zod`（结构化输出校验），且**只允许出现在 `src/core/structured/`**；其余第三方包一律禁止。若需新依赖，先讨论是否应下沉为 port 契约或上移为 adapter。

### 3. config 层不得实例化 adapter
- `src/config/` 只负责读取配置（环境变量、配置文件）
- 依赖注入容器（如 `Container.ts`）应放在 `src/server/`
- **禁止**在 `loadConfig()` 或 `Container.ts` 中 `new LangGraphXxx()`

---

## 三、架构审查 Checklist

每次提交前，必须自查以下项目：

- [ ] **依赖方向**：`core/` 中是否出现了 `import("...adapter/...")`？
- [ ] **文件系统**：`core/` 中是否出现了 `fs`、`path`、`fetch`？
- [ ] **硬编码配置**：超时、阈值、开关等是否硬编码在业务代码中？应纳入 `FrameworkConfig` + `loadConfig()` + `.env.example`
- [ ] **提示词加载**：子 Agent / Planner / Router 的 systemPrompt 是否硬编码？应通过组装根注入
- [ ] **工具注册**：新工具是否在 `bootstrap.ts` 中注册？工具名是否与提示词期望一致？
- [ ] **端口契约**：适配器实现是否静默破坏端口契约？降级行为是否可审计（如 `fallback` 标记）？
- [ ] **租户边界**：仓储查询是否带 `userId`？是否出现全局 `setUserId` / 请求间共享可变租户状态？
- [ ] **模拟数据**：代码中是否有 TODO / FIXME / mock / placeholder？未实现部分必须显式标记
- [ ] **架构守护（工具强制）**：`pnpm lint`（eslint `no-restricted-imports` 分层规则）与 `pnpm test`（`test/architecture/layer-boundaries.test.ts` 扫描全部 import）是否通过？这两道闸不可绕过，违反分层时先改代码再提交

---

## 四、功能开发规范

### 提示词管理
- 所有提示词文件放在 `prompts/*.md`
- **禁止**在 `core/` 层模块加载时调用文件读取
- `server/bootstrap.ts` 在启动时统一加载，通过 `DirectorDeps.prompts` / `configureSubAgentDescriptors()` 注入

### 工具开发
- 框架无关的业务工具 → `src/core/tool/`
- 第三方外部服务适配器 → `src/adapter/<vendor>/`
- 通用工具包装器（如 `DelegatingTool`）→ `src/core/tool/`（仅依赖 `port/`）
- 工具注册与名称映射 → `src/server/bootstrap.ts`（组装根职责）

### 执行与流式输出
- HTTP 创建幂等 Execution 后入 Redis 队列；由 `ExecutionWorker` 执行并写可重放事件流
- query 模式：直接调用 `model.stream()`，转发原始 token
- design 模式：发送结构化进度事件（`plan` / `route` / `task_start` / `task_complete` / `integrate` / `hitl`）
- DAG 前驱失败后继标记 `skipped`，不得继续调用 executor
- **禁止**执行完成后伪分块模拟流式

### HITL（Human-in-the-loop）
- 审阅点配置通过 `FrameworkConfig.hitl` 管理
- 标准审阅点：`hitl-1-task-plan`、`hitl-2-agent-output`、`hitl-3-final`
- 生产主链使用 `DurableHumanReviewGateway`：返回 `pending`，执行进入 `waiting_hitl`，审批后 resume 入队
- 降级行为必须返回可审计标记（`ReviewResult.fallback: true`），**禁止静默通过 / 静默自动批准**

### Hooks 系统
- `LangGraphAgentAdapter` 必须在关键阶段调用 hooks：`pre/post_reasoning`、`pre/post_tool_execution`、`pre/post_agent_call`、`pre/post_summary`、`on_error`、`on_iteration_budget`
- Hooks 定义在 `port/` 层，实现放在 `core/hook/`

### 运行时护栏（现役，勿静默拆除）
- **观测**：Session/Trace/Span 九态落库；降级与拒绝须可审计（`fallback` / Trace span）
- **弹性**：模型 Fallback 链；工具四策略（retry / return_to_llm / degrade / fast_fail）+ 外部/MCP 熔断；Token 硬预算与工具循环检测
- **Plan**：代码驱动 DAG；步骤 `allowedTools`（`[]` = 禁止外部工具）；有限重规划
- **多 Agent**：全局 Token、fan-out 分批、`invoke_agent` 深度/环检测、Handoff 蒸馏（下游禁灌全文轨迹）
- **结构化输出**：LLM JSON 经 schema 校验 → 错因重试 → 可审计降级/抛错；**禁止**静默空计划
- **MCP**：默认 `on_demand` 按前缀/Skill/任务白名单暴露；与进程内工具同一韧性与安全包装
- **SSE**：心跳 comment；按 `executionId` 续订（不新建 execution）；断连只停订阅不杀 Worker
- **版本**：Prompt/Skill/Workflow 会话快照 MVCC；灰度/回滚不改写已绑定会话
- **知识库**：Wiki/RAG/向量索引归独立项目 `knowledge-hub`；本仓只保留工具适配点

---

## 五、环境变量规范

新增配置项必须同时修改以下 3 处：
1. `src/config/FrameworkConfig.ts` — 类型定义
2. `src/config/loadConfig.ts` — 读取逻辑（支持环境变量）
3. `.env.example` — 文档与默认值

---

## 六、验证标准

任何功能修改完成后，必须满足：
1. `pnpm run build` — TypeScript 编译通过
2. `pnpm test` — 全部测试通过
3. 可跑完一个完整案例（design / query / table 至少各一条 happy path）
4. 架构自查 Checklist 全部通过
5. Docker 镜像依赖本地 `dist/`：改源码后需重建镜像再验 live

---

## 七、技能与 Workflow 命名

- 目录名与 `SKILL.md` 中的 `name` 字段必须完全一致
- 使用连字符 `-` 格式（如 `combat-design`，而非 `combat_design`）
