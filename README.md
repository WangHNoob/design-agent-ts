# game-designer-ts

> 把"做一份游戏策划案"从一个人对着空白文档冥思苦想，变成一支各有专长的 AI 策划团队协同作业——有人管战斗、有人管数值、有人管玩法，有人负责挑错，最后交出一份彼此不打架、可追溯、能持续迭代的设计方案。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

game-designer-ts 想解决的，不是"让大模型帮我写点策划文案"——那很容易。它解决的是：**当一份策划案需要多个专业领域协同、需要对齐、需要经得起反复推敲和修改时，如何让一群 AI 像一支真正的策划团队那样工作**。

## 界面预览

![策划 AI 团队控制台](docs/Agent.png)

> 策划控制台：一句需求 → 主策划（Director）拆解任务清单 → 六位专职策划并行产出 → 跨领域冲突检测 → 人审（HITL）验收终稿；query / design / table 三种模式。

---

## 一、要解决什么问题

一份像样的游戏策划案，从来不是一个人能拍脑袋写完的。它牵扯战斗、数值、玩法、系统、执行落地、质量把关——每一块都有自己的专业，而它们又必须严丝合缝地咬合在一起。真实团队里，这靠的是分工、评审会和无数轮对齐。

如果直接让单个大模型"写一份完整策划案"，会撞上三堵墙：

1. **不专业**——一个通才模型什么都懂一点，但战斗数值的手感、经济系统的平衡、玩法循环的节奏，需要的是各自钻进去的深度，而非样样浅尝。
2. **不一致**——战斗说这把武器攻击力 100，数值表里却写 80；玩法设计假设了一个系统，系统设计根本没做。单次生成的长文档，内部矛盾无人发现。
3. **不可控**——人无法在关键节点介入。要么全盘接受 AI 的产出，要么推倒重来，没有"先确认任务拆解，再往下走"的余地。

game-designer-ts 的回答是：**把一份策划案当成一个团队项目来做**——拆分领域、分派给专职 Agent、让它们基于同一份可信知识协作、在关键节点交给人确认、产出后自动查冲突，最终整合成一份连贯的方案。

---

## 二、它是怎么工作的

想象一位**主策划**接到需求后的动作，这套系统把它自动化了:

```
   一句需求                    主策划（Director）
"做一个开放世界武侠 MMO      ┌─────────────────────────┐
 的战斗与成长系统"     ──▶   │ 1. 拆成一张任务清单       │──▶  人确认/修改任务拆解
                            │ 2. 把每个任务派给对的人   │
                            │ 3. 让他们并行开工、互相看  │
                            │ 4. 收齐产出、查有没有打架  │──▶  人验收最终方案
                            └─────────────────────────┘
                                       │
        ┌──────────┬──────────┬────────┼────────┬──────────┬──────────┐
        ▼          ▼          ▼        ▼        ▼          ▼
     战斗策划    数值策划    玩法策划   系统策划   执行策划    质量审查
   (CombatDes) (Numerical) (Gameplay) (System) (Executive)   (QA)
        └──────────┴──────────┴────────┴────────┴──────────┘
                          都从同一份可信知识取材
                    （Knowledge Hub 已发布知识 + 联网补充）
```

- **一位主策划统筹全局**：`DirectorAgent` 接到需求后，先把它拆成一张带依赖关系的任务清单，再把每项任务派给最合适的专职 Agent。
- **六位专职策划各司其职**：战斗、数值、玩法、系统、执行、质量审查——每位都有自己的专业提示词、自己的工具集，钻进各自领域做深。
- **都从同一口井取水**：各 Agent 优先查询 [Knowledge Hub](https://github.com/WangHNoob/knowledge-hub) 里**已发布、带证据、可追溯**的知识资产，不足时再联网补充——保证大家基于同一份事实工作，而非各自臆想。
- **人始终在环里**：任务拆解后、单份产出后、最终整合后，三个节点都可以让人确认或修改，绝不"静默往下冲"。
- **产出会自动对账**：所有 Agent 交稿后，系统提取各自定义的字段，检测跨领域冲突（同一属性被赋了不同值），生成冲突报告——而不是把六份文档一拼了事。

支持三种工作模式：**design**（完整策划流程）、**query**（直接问答知识库）、**table**（产出结构化配表）。

---

## 三、一个刻意的工程选择：与框架彻底解耦

做到上面这些，用任何一个 Agent 框架都能实现。但这个项目多问了一句：

> 如果把 Agent 框架（LangGraph、CrewAI、AutoGen……）当成随时可以换掉的实现细节，业务逻辑本身应该长什么样？

这个追问塑造了整个代码结构。核心目标有三个:

1. **框架可替换**——今天跑在 LangGraph 上，明天想换别的运行时，编排逻辑与领域逻辑一行不改。
2. **边界可验证**——分层不是靠文档自觉，而是靠编译器和静态分析强制：`core/` 目录里搜不到任何一个 `@langchain/*` 的 import。
3. **系统可演进**——加一个子 Agent、换一种记忆策略、插一个审阅点，都不用去动已有的业务逻辑。

换句话说，**"多智能体游戏策划"是这套架构要证明的第一个真实案例，而架构本身是可以复用到其他多 Agent 场景的基座。**

---

## 四、架构骨架

### 分层模型

依赖方向永远向内：`adapter → core → port`，绝无反向。

```
┌──────────────────────────────────────────────────┐
│              Port 接口层 (src/port/)               │
│  纯 TypeScript 接口，零外部依赖                      │
│  Agent · Model · Tool · Memory · Hook · Skill ·    │
│  Session · User · Queue · FileSystem · MCP · ...   │
├──────────────────────────────────────────────────┤
│              Core 业务层 (src/core/)                │
│  框架无关的纯业务逻辑，仅依赖 port/                    │
│  DirectorAgent · Pipeline · Execution · HITL ·     │
│  Hooks · Blackboard · LTM · Skill · Workspace      │
├──────────────────────────────────────────────────┤
│            Adapter 适配层 (src/adapter/)            │
│  框架与基础设施的具体实现，可依赖 port/ + core/        │
│  langgraph · postgres · redis · betterauth ·       │
│  tavily · fs · mock · ...                          │
├──────────────────────────────────────────────────┤
│           组装根 (src/server/)                      │
│  Composition Root：依赖注入、路由、中间件              │
│  bootstrap.ts · Container.ts · routes/*            │
├──────────────────────────────────────────────────┤
│           配置层 (src/config/)                      │
│  仅负责类型定义与环境变量读取，不实例化任何 Adapter      │
└──────────────────────────────────────────────────┘
```

### 三条红线（由 `AGENTS.md` 强制执行）

| 规则 | 说明 |
|------|------|
| **core 不依赖 adapter** | `core/` 中禁止静态或动态 `import` 任何 `adapter/` 文件 |
| **core 不操作基础设施** | `core/` 中禁止使用 `fs`、`path`、`fetch` 等 API，一切通过 Port 抽象 |
| **config 不实例化 Adapter** | `config/` 只读取配置，依赖注入容器放在 `server/` |

### Port 层：接口族

`src/port/` 用接口族覆盖智能体系统的横切关注点。每个 Port 只定义"需要什么能力"，不关心"谁来提供"，Adapter 层负责填空。

| 接口族 | 核心契约 | 职责 |
|--------|---------|------|
| `agent/` | `AgentPort`, `AgentFactory`, `AgentDescriptor` | Agent 生命周期与工厂模式 |
| `model/` | `ChatModelPort` | LLM 调用抽象 |
| `tool/` | `ToolPort`, `ToolRegistry` | 工具注册与执行 |
| `memory/` | `MemoryPort`, `LongTermMemoryPort` | 会话记忆与长期记忆 |
| `hook/` | `AgentHook`, `HookPoint` | 生命周期拦截点 |
| `skill/` | `SkillPort`, `SkillRegistry` | 技能与工作流匹配 |
| `session/` | Session 管理 | 会话持久化 |
| `execution/` | `ExecutionRepository` | 持久执行状态与任务 attempt |
| `hitl/` | `HITLRepository` | 人工审阅 checkpoint |
| `user/` | `TenantIsolationPort`, `UserPort` | 多租户与鉴权 |
| `fs/` | `FileSystemPort` | 文件系统抽象 |
| `mcp/` | `McpClientPort` | MCP 协议客户端 |
| `queue/` | `MessageQueuePort` | 消息队列 |
| `blackboard/` | 会话级共享缓存 | 工具/联网结果去重 |
| `infra/` | `IdGeneratorPort`, `DatabasePort`, `ContextStoragePort` | ID / 数据库 / 异步上下文 |
| `tracing/` | `TracerPort`, `TraceStorePort` | Session / Trace / Span 可观测 |
| `audit/` | `AuditStorePort` | 审计日志 |
| `cost/` | `CostStorePort`, `RateLimitPort` | 成本归因与 RPM/TPM |
| `eval/` | `EvalStorePort`, `ScorerPort` | Online/Offline 评测 |
| `versioning/` | `VersionStorePort` | Prompt/Skill/Workflow 版本快照 |
| `message/` | `ChatMessage` | 消息数据结构 |

---

## 五、编排的关键设计

### Pipeline：依赖感知的并行执行

`PlanPipeline` 把任务按依赖关系拓扑排序，分层并行:

```
Layer 0: [战斗设计] [系统设计]      ← 无依赖，并行开工
Layer 1: [数值规划]                ← 依赖战斗+系统，等它们完成
Layer 2: [玩法设计] [执行规划]      ← 依赖数值，并行
```

每层内并行（`Promise.all`），层间串行；前置任务的产出自动注入为后继任务的上下文；支持 `AbortSignal` 优雅取消。前驱失败时后继标记 `skipped`，不再调用 executor。

### Blackboard：一块团队共享的黑板

多个 Agent 并行工作时，难免查到相同的知识、发起相同的联网搜索。`Blackboard` 是一块**会话级、带 TTL 的共享缓存**：任一 Agent 搜到的关键要点、联网返回的内容，都记在黑板上供全队复用——避免重复的工具调用与联网 API 开销，也让后开工的 Agent 一眼看到前面沉淀的要点。

### Integrator：跨 Agent 冲突检测

不是把产出拼起来就完事。`Integrator.integrateStructured()` 用启发式（表格行 / `key: value`）抽取字段写入 `FieldRegistry`，检测跨域同字段多值冲突，生成冲突报告与字段注册表写入工作空间 `final/`。这是 **可验证信号**，不是模型自评「一致」。

诚实边界：复杂 prose 里的隐含矛盾可能漏检——报告为空不等于真一致。

### HITL：人始终能按下暂停键

标准审阅点契约（`FrameworkConfig.hitl.reviewPoints`，可独立开关）：

```
hitl-1-task-plan    → 任务规划完成后，人工确认/修改
hitl-2-agent-output → 单个 Agent 产出后，人工审阅（契约位）
hitl-3-final        → 最终整合结果，人工验收（契约位）
```

**生产主链**（`bootstrap` → `DirectorAgent`）使用 `DurableHumanReviewGateway`：审阅点写入 PostgreSQL，Execution 进入七态中的 `waiting_hitl`，人审批后经 Redis 队列 resume。缺 `executionId` / 租户上下文直接抛错；超时走 `HITL_TIMEOUT_POLICY`（默认 `auto_reject`）并带 `fallback: true`，**禁止静默自动批准**。

诚实边界：当前 `DirectorAgent` design 流**已落地 HITL-1**；HITL-2/3 在配置与 `LangGraphDirectorGraph` 脚手架中存在，跨 Agent 冲突主要靠 `Integrator` 冲突报告 fail loud。组装时务必用 Durable 网关覆盖 `Container` 默认的 `LangGraphHumanReviewGateway`（后者依赖图内 `interrupt`，不适合多 Worker 生产）。

### Plan 硬保障与工具白名单三态

不完全信任 LLM 规划。`PlanHardGuard` + `runPlanWithReplan` 约束可执行性与重规划预算；每步 `allowedTools` 三态：

| 值 | 语义 |
|----|------|
| `undefined` | 继承 domain 默认工具面（可含 MCP on-demand 前缀） |
| `[]` | **严格零外部工具 / 零 MCP** |
| 非空数组 | 仅白名单；经 `stripAndMergeMcpToolNames` + `WhitelistToolRegistry` 防 MCP 权限泄漏 |

### Hooks：横切关注点与业务解耦

在 Agent 执行关键阶段插入 `HookPoint`（与业务逻辑解耦）：

`pre/post_reasoning` · `pre/post_tool_execution` · `pre/post_agent_call` · `pre/post_summary` · `on_error` · `on_iteration_budget`

组装根注册的典型实现包括：Tracing、Cancellation、Validation、IterationBudget、TokenBudget、ToolLoopDetector、ContextManagement、MemoryInjection、KnowledgeFlywheel、StreamEmitter 等。Trace Span 另有九态相位（`NINE_SPAN_PHASES`），与 Execution 七态状态机不要混称。

### 长期记忆（LTM）

四类记忆独立管理，抽取与注入通过 Hooks 自动完成，对 Agent 透明:

| 类型 | 内容 | 策略 |
|------|------|------|
| 语义记忆 | 领域知识、概念 | 按相关性检索 |
| 情节记忆 | 历史会话摘要 | 按时间/重要性裁剪 |
| 程序记忆 | 工作流、方法论 | 按任务类型匹配 |
| 用户画像 | 偏好、习惯 | 持续更新 |

### 执行与流式输出

HTTP 只负责创建幂等 Execution 并入队；`ExecutionWorker` 消费 Redis Streams，把进度写入可重放事件日志。

- **query 模式**：直接转发模型 token 流。
- **design 模式**：结构化进度事件（`plan` / `route` / `task_start` / `task_complete` / `integrate` / `hitl` / `cancelled`）。
- **SSE 产品化**：周期性 `: heartbeat` comment；`Last-Event-ID` / `GET .../executions/:id/events` 续订；**断连只停订阅，不杀 Worker**；刷新可用 `GET /executions/:id` 拉终态。

**禁止**执行完成后伪分块模拟流式。

### Query 模式可靠性护栏

- **FAQ 快速路径**：query 入口先做高置信 FAQ 匹配，命中即直接返回答案、不进 LLM——更省 token、首字延迟更低（`FAQ_ENABLED` 默认关闭）。
- **重复工具调用守卫**：同一工具以相同参数连续重复调用时自动拦截并提示模型改用其他方式，防止无效循环消耗预算。
- **消息序列兜底校验**：发送给模型前校验消息流合法性，压缩/归档导致的"悬空工具结果"自动降级为普通文本，避免整轮失败。
- **thinking 模型往返保真**：消息在压缩/归档往返中保留模型的思考内容（`reasoning_content`），满足 thinking 模型的回传要求。
- **工具结果截断**：单条工具结果进上下文前按字符数截断（`TOOL_RESULT_MAX_CHARS`），控制长知识库返回体的上下文占用。

---

## 六、知识来源：站在 Knowledge Hub 之上

各专职 Agent 的知识取材遵循一条明确的优先级策略（见各 `prompts/*.md`）：

1. **Knowledge Hub 优先**（`kb_*` MCP 工具）——查已发布、带信任分与证据链的知识资产。`MCP_ENABLED=true` 显式开启（`.env.example` 默认开，代码默认关，未配置即不挂 MCP）。
2. **本地 wiki / kg 仅作灾难降级**——当 MCP 已成功加载 `kb_search` 时，默认**不再注册**本地 `wiki_*` / `grep` / `kg_*`，避免双源冲突；需要双开时设 `MCP_DISABLE_LOCAL_KNOWLEDGE_WHEN_HEALTHY=false`。
3. **主动联网补充**（`tavily-search`）——涉及时效性内容、检索无果或用户明确要求时，精准联网 1–3 次。
4. **来源标注与飞轮回写**——任务侧栏展示 trust / evidence；低证据或空检索时由代码钩子调用 `kb_report_*`，会话结束批量 `kb_submit_attribution`，而不仅依赖 prompt 自觉。

联调必配：

| 变量 | 说明 |
|------|------|
| `MCP_ENABLED=true` | 打开 MCP |
| `MCP_SERVERS` | 指向 KH `/mcp`（HTTP + Bearer JWT） |
| `MCP_PROJECT_ID` | **显式** Knowledge Hub 项目 ID，禁止静默 `default_project` |
| （勿设）`toolPrefix: "kb_"` | 工具名已是 `kb_*`，再加前缀会变成 `kb_kb_search` |

这套策略让 AI 的产出**有据可查**：每一句设计判断，尽量落到一份可追溯的知识来源上。
---

## 七、技术栈

| 层 | 选型 | 可替换性 |
|----|------|---------|
| 语言 | TypeScript 5.9, Node.js >= 20, ESM | — |
| Agent 运行时 | LangGraph TS（通过 adapter） | 新增 adapter 即可切换 |
| LLM | OpenAI / Anthropic / 兼容协议 | 通过 `ChatModelPort` 抽象 |
| HTTP | Hono | 轻量，可替换为 Express/Fastify |
| 数据库 | PostgreSQL 16 + pgvector | 通过 `DatabasePort` 抽象 |
| 缓存/队列 | Redis 7 | 通过 `MessageQueuePort` 抽象 |
| 鉴权 | Better Auth | 通过 `UserPort` 抽象 |
| 前端 | Next.js 16 · React 19 · TailwindCSS · Zustand | — |
| 测试 | Vitest | — |

---

## 八、项目结构

```
src/
├── port/          # 纯接口定义（含 execution / hitl / queue 等）
├── core/          # 框架无关业务逻辑
│   ├── agent/     #   DirectorAgent + 6 个子 Agent
│   ├── pipeline/  #   依赖感知的任务流水线（含 skipped / fan-out）
│   ├── plan/      #   Plan 硬保障（白名单 / 重规划）
│   ├── multiagent/#   调用栈守卫、Handoff、invoke_agent
│   ├── structured/#   LLM JSON schema 校验与重试
│   ├── resilience/#   熔断器注册表
│   ├── execution/ #   执行状态机与幂等服务
│   ├── blackboard/#   团队共享黑板（工具/联网结果缓存）
│   ├── hitl/      #   DurableHumanReviewGateway / 超时运营
│   ├── hook/      #   生命周期拦截
│   ├── memory/    #   短时滑窗归档 + 长期记忆
│   ├── eval/      #   Eval V1
│   ├── versioning/#   制品版本与会话快照
│   ├── cost/      #   成本计量与限流
│   ├── saga/      #   补偿协调
│   ├── audit/     #   审计（内存实现；PG 在 adapter）
│   ├── schema/    #   领域模型
│   ├── session/   #   会话管理
│   ├── skill/     #   技能/工作流
│   ├── tool/      #   业务工具（含 MCP 适配）
│   ├── user/      #   用户上下文
│   └── workspace/ #   工作区管理
├── adapter/       # 框架与基础设施适配器
│   ├── langgraph/ #   LangGraph 适配
│   ├── mock/      #   测试 Mock
│   ├── postgres/  #   PostgreSQL（Session/LTM/HITL/Execution）
│   ├── redis/     #   Redis（租户/队列/事件流）
│   ├── betterauth/#   鉴权
│   ├── tavily/    #   联网搜索
│   ├── fs/        #   文件系统
│   └── infra/     #   基础设施
├── config/        # 配置加载（类型 + 读取，不实例化）
└── server/        # 组装根 + HTTP 服务
    ├── bootstrap.ts   # 依赖注入与启动
    ├── worker/        # ExecutionWorker（异步执行）
    ├── app.ts         # Hono 应用
    ├── middleware/    # 鉴权中间件
    └── routes/        # 业务路由
drizzle/           # 数据库迁移（唯一 schema 真相源）
prompts/           # 所有提示词（*.md）
test/              # 测试
```

---

## 九、快速开始

需要 Node.js >= 20。**生产与本地运行均强制** PostgreSQL 16 + Redis 7 + Better Auth 密钥 + `MQ_ENABLED=true`；缺任一项会在 `validateConfig` fail-fast。表结构只通过 `drizzle/` 迁移应用，启动时不再建表。

### Docker（推荐验收整条链路）

```bash
cp .env.example .env
cp settings.example.json settings.json   # 若不存在；UI 保存的 LLM 配置会写回此文件
# 必填：LLM_API_KEY、BETTER_AUTH_SECRET（也可在设置页填写，会持久化到 settings.json / .env）
# 改代码后需重新 build 镜像；LLM 配置已挂载宿主机，重建后无需重填

node docker-start.mjs            # 智能检测：PG/Redis 可达则只起 app
node docker-start.mjs --infra    # 强制起基础设施（含监控 profile 时另见脚本）
node docker-start.mjs --rebuild  # 本地 build 后打进镜像再 up
# 等价：docker compose up -d
```

| 入口 | Docker Compose 默认 | 说明 |
|------|---------------------|------|
| 前端 | http://localhost:3001 | 容器内 Next 映射 |
| 后端 API / health | http://localhost:13000 、`/health` | `BACKEND_PORT` 可改 |
| PostgreSQL | localhost:5432（`POSTGRES_PORT`） | `.env.example` 本地联调示例也可能用 `15432` |
| Redis | localhost:6379（`REDIS_PORT`） | 同上，示例可能用 `16379` |

以你 `.env` 里的 `POSTGRES_URL` / `REDIS_URL` 为准。`migrate` 服务会在 backend 之前应用 `drizzle/*.sql`。

Docker 将宿主机 `./settings.json` 与 `./.env` 挂载进 backend，设置页保存的模型密钥会写回宿主机，**镜像重建后仍保留**。

### 本地开发

```bash
pnpm install
cp .env.example .env
# 至少填写：LLM_API_KEY、LLM_PROVIDER、LLM_MODEL、BETTER_AUTH_SECRET、
# POSTGRES_URL、REDIS_URL，并设 MQ_ENABLED=true（validateConfig 缺任一项 fail-fast）

# 先有可用的 PostgreSQL/Redis，再应用迁移
pnpm db:migrate   # 或 docker compose up migrate

pnpm dev          # 后端（默认 PORT=4527）
pnpm dev:web      # 前端 Next.js（本地默认端口 4528，见 frontend/package.json）

pnpm test
pnpm run build
pnpm eval:offline   # Eval V1 Offline（--exact-only 默认精确匹配，无需 LLM；去掉可启用 llm_judge）
pnpm eval:gate      # 回归门禁：跑 offline eval 并与 eval/baseline.json 基线对比（flywheel 01-P4）
```

| 入口 | 本地 `pnpm` 默认 |
|------|------------------|
| 后端 | http://localhost:4527 |
| 前端 | http://localhost:4528 |

`pnpm dev:local` 还会尝试拉起同级目录的 Knowledge Hub；脚本内 KH 路径与部分凭据是本机约定，换机器需改 `scripts/start-local.mjs`。

联调 Knowledge Hub：`MCP_ENABLED=true`、`MCP_SERVERS` 指向 KH `/mcp`、**显式**设置 `MCP_PROJECT_ID`；MCP 已加载 `kb_search` 时默认禁用本地 wiki 双源（`MCP_DISABLE_LOCAL_KNOWLEDGE_WHEN_HEALTHY`）。

### 共享库（5433）迁移：用 `db:apply`，不要用 `db:migrate`

本仓与观测台共用 `localhost:5433/game_designer`（观测契约）。该库的 `__drizzle_migrations`
是旧版整数记账（`id integer / hash text / created_at bigint`），**不跟踪 `drizzle/*.sql` 的
真实应用状态**：对它跑 `pnpm db:migrate` 会从头重放 `0000` 的 `CREATE TABLE` 并报
`relation already exists`。因此共享库的结构增量一律走幂等补齐脚本：

```bash
pnpm db:apply           # 幂等应用全部增量（加列/新表/索引），可重复执行
pnpm db:apply:check     # 只校验状态不写库，有缺失时 exit 1（巡检/CI 用）
POSTGRES_URL=postgresql://game_designer:***@localhost:5433/game_designer  # 默认即此
```

**后续新增迁移的流程**：`pnpm db:generate` 正常产出 `drizzle/NNNN_*.sql`（供全新库/CI 应用）；
再把其中的结构增量按幂等写法（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS`）追加到 `scripts/apply-pending-migrations.mts` 的 `stmts` 列表
（按迁移号分组注释），然后 `pnpm db:apply` 落到共享库。

### 评测回归门禁（flywheel 01-P4）

`pnpm eval:gate` 把 `pnpm eval:offline`（exact-only，零 LLM 成本）的结果与 `eval/baseline.json` 对比：

- **通过数回归**：基线中通过的评分项本次失败 → FAIL，并列出具体 `caseId/metricId`；
- **均分回落**：averageScore 低于基线 −0.02（可用 `--tolerance` 调整）→ FAIL；
- **数据集漂移**：`eval/datasets/design-golden.v1.json` 内容哈希与基线不一致 → FAIL（EV-027 类"golden 过时"的机制性防护：golden 变更必须显式刷新基线）。

常用参数：`--report <path>` 复用已有报告；`--update-baseline` 把本次结果记为新基线（golden 有意变更后使用）；`--baseline <path>` 指定基线文件。CI 中把 `pnpm eval:gate` 挂为 Agent/提示词改动的前置检查即可。离线 runner 只对带 `recordedOutput` 的 fixture 用例打分，纯在线用例在 `pnpm eval:offline` 中跳过（CI 门禁针对可复算的离线子集）。

完整云部署步骤见 [DEPLOY.md](./DEPLOY.md)。

---

## 十、评测与验证

知识库升级与 Agent 改动是否真的"变好了"，靠一套**可复算、可审计**的评测体系回答：

- **黄金评测集**：78 道知识问答用例（含回归集与新增集），覆盖单表检索、跨表关联、数值计算、经济闭环、一致性、证据链、防幻觉七类能力，每题带关键事实断言、字段数值断言与幻觉锚点。
- **自动打分**：数值严格匹配（精确值 / 容差），表达形式兼容内联与表格；未注册 ID 计入幻觉记录，防幻觉类题目出现幻觉 ID 直接判失败。
- **数值审计**：评测集里每个期望值由程序从配表数据重新计算比对，防止"拿错误答案考模型"（评测集与数据更新需同步）。
- **回归门禁**：Agent / 知识库改动后重跑评测，对比前后得分确认无"旧通过 → 新失败"回归。

评测脚本与黄金集位于配套的 [knowledge-hub](https://github.com/WangHNoob/knowledge-hub) 工程 `evals/` 目录。

### 执行结果信号（flywheel 01-P4）

每个 execution 的终态（completed / failed / cancelled / timed_out / hitl_rejected）都会写入结构化信号，供 agent-observe 聚合与回流调度消费：

- **落库**：`executions.requirement_hash`（需求归一化 FNV-1a 哈希，用于同类问题聚类）+ `executions.outcome_signal`（jsonb，含 mode/outcome/attempts/hitlCheckpoints/failReason）；`ExecutionService` 的终态转换处统一写入，HTTP 取消、HITL 超时清扫等旁路同样覆盖。迁移见 `drizzle/0008_fat_supernaut.sql`。
- **事件流**：worker 在每个终态追加 `execution_outcome` 事件（含重试次数与经过的审阅点）。
- **HITL**：拒绝时信号 outcome 覆盖为 `hitl_rejected`；`modified` 通过 `hitl.decision` 审计日志 + 信号中的 `hitlCheckpoints` 追踪。
- 需求哈希为纯函数（`src/core/execution/outcomeSignal.ts`），空白/大小写差异不产生新聚类桶。

### FAQ 指标门禁（flywheel 01-P4）

`FAQ_REQUIRE_METRICS=true`（默认）时，即使 `FAQ_ENABLED=true`，FAQ 快速路径也**强制关闭**并在启动时打印告警——直到观测台确认命中率 ≥ 70% 且无"错命中"反馈后，显式设 `FAQ_REQUIRE_METRICS=false` 才生效（与 agent-observe 告警联动，杜绝无指标支撑的静默开启）。

---

## 十一、开发规范

架构红线与提交自查清单详见 [AGENTS.md](./AGENTS.md)，核心要点：

- **依赖方向**：`core/` 不得依赖 `adapter/`，不得使用基础设施 API
- **配置注入**：提示词在组装根加载后注入，不在 core 层读取文件
- **降级可审计**：Adapter 降级行为必须返回可验证标记
- **验证标准**：`pnpm run build` + `pnpm test` 全部通过

---

## License

MIT（见 `package.json` `license` 字段）。
