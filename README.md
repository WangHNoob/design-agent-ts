# game-designer-ts

> 把"做一份游戏策划案"从一个人对着空白文档冥思苦想，变成一支各有专长的 AI 策划团队协同作业——有人管战斗、有人管数值、有人管玩法，有人负责挑错，最后交出一份彼此不打架、可追溯、能持续迭代的设计方案。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

game-designer-ts 想解决的，不是"让大模型帮我写点策划文案"——那很容易。它解决的是：**当一份策划案需要多个专业领域协同、需要对齐、需要经得起反复推敲和修改时，如何让一群 AI 像一支真正的策划团队那样工作**。

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
- **都从同一口井取水**：各 Agent 优先查询 [Knowledge Hub](https://github.com/) 里**已发布、带证据、可追溯**的知识资产，不足时再联网补充——保证大家基于同一份事实工作，而非各自臆想。
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
| `infra/` | `IdGeneratorPort`, `DatabasePort` | ID / 数据库 |
| `tracing/` | 链路追踪 | 可观测性 |
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

不是把产出拼起来就完事。`Integrator` 提取各 Agent 产出中的字段定义，检测跨域冲突（如同一属性被不同 Agent 赋了不同值），生成冲突报告，确保最终方案自洽。

### HITL：人始终能按下暂停键

三个标准审阅点嵌入流程，每个可独立开关。生产主链使用 `DurableHumanReviewGateway`：把审阅点写入 PostgreSQL，执行进入 `waiting_hitl`，审批后再经 Redis 队列恢复；图外失败返回 `rejected` + `fallback: true`，**禁止静默自动批准**。

```
hitl-1-task-plan    → 任务规划完成后，人工确认/修改
hitl-2-agent-output → 单个 Agent 产出后，人工审阅
hitl-3-final        → 最终整合结果，人工验收
```

### Hooks：横切关注点与业务解耦

在 Agent 执行的关键阶段插入拦截点（`pre/post_reasoning`、`pre/post_tool_exec`、`pre/post_agent_call`、`on_error`、`on_iteration_budget`），承载上下文管理、记忆注入/抽取、流式事件发射、输出格式校验等——与业务逻辑完全分离。

### 长期记忆（LTM）

四类记忆独立管理，抽取与注入通过 Hooks 自动完成，对 Agent 透明:

| 类型 | 内容 | 策略 |
|------|------|------|
| 语义记忆 | 领域知识、概念 | 按相关性检索 |
| 情节记忆 | 历史会话摘要 | 按时间/重要性裁剪 |
| 程序记忆 | 工作流、方法论 | 按任务类型匹配 |
| 用户画像 | 偏好、习惯 | 持续更新 |

### 执行与流式输出

HTTP 只负责创建幂等 Execution 并入队；`ExecutionWorker` 消费 Redis Streams，把进度写入可重放事件日志，SSE 断开不取消业务执行。

- **query 模式**：直接转发模型 token 流。
- **design 模式**：结构化进度事件（`plan` / `route` / `task_start` / `task_complete` / `integrate` / `hitl`）。

**禁止**执行完成后伪分块模拟流式。

---

## 六、知识来源：站在 Knowledge Hub 之上

各专职 Agent 的知识取材遵循一条明确的优先级策略（见各 `prompts/*.md`）：

1. **Knowledge Hub 优先**（`kb_*` 工具）——先查已发布、带信任分与证据链的知识资产。
2. **文件知识库备用**（`wiki_*`、`kg_*`）——Knowledge Hub 不可用或空结果时，走本地 wiki 与知识图谱。
3. **主动联网补充**（`tavily-search`）——涉及时效性内容、检索无果或用户明确要求时，精准联网 1–3 次。
4. **来源标注**——都找不到时，明确说明，绝不臆造。

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
│   ├── pipeline/  #   依赖感知的任务流水线（含 skipped）
│   ├── execution/ #   执行状态机与幂等服务
│   ├── blackboard/#   团队共享黑板（工具/联网结果缓存）
│   ├── hitl/      #   DurableHumanReviewGateway 等
│   ├── hook/      #   生命周期拦截
│   ├── memory/    #   长期记忆
│   ├── schema/    #   领域模型
│   ├── session/   #   会话管理
│   ├── skill/     #   技能/工作流
│   ├── tool/      #   业务工具
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
# 必填：LLM_API_KEY、BETTER_AUTH_SECRET；改完代码需重新 build 镜像

docker compose up -d --build
```

| 入口 | 默认地址 |
|------|----------|
| 前端 | http://localhost:3001 |
| 后端 API / health | http://localhost:13000 、`/health` |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

`migrate` 服务会在 backend 之前应用 `drizzle/*.sql`。若从旧 PG 18 卷升级失败，需重建 `postgres_data` 卷（开发数据会清空）。

### 本地开发

```bash
pnpm install
cp .env.example .env
# 至少填写：LLM_API_KEY、LLM_PROVIDER、LLM_MODEL、BETTER_AUTH_SECRET、
# POSTGRES_URL、REDIS_URL，并设 MQ_ENABLED=true

# 先有可用的 PostgreSQL/Redis，再应用迁移
pnpm db:migrate   # 或 docker compose up migrate

pnpm dev          # 后端（默认读 .env 的 PORT，示例为 4527）
pnpm dev:web      # 前端（3001）

pnpm test
pnpm run build
```

`pnpm dev:local` 还会尝试拉起 Knowledge Hub；脚本内 KH 路径是本机约定，换机器需改 `scripts/start-local.mjs`。

完整云部署步骤见 [DEPLOY.md](./DEPLOY.md)。

---

## 十、开发规范

架构红线与提交自查清单详见 [AGENTS.md](./AGENTS.md)，核心要点：

- **依赖方向**：`core/` 不得依赖 `adapter/`，不得使用基础设施 API
- **配置注入**：提示词在组装根加载后注入，不在 core 层读取文件
- **降级可审计**：Adapter 降级行为必须返回可验证标记
- **验证标准**：`pnpm run build` + `pnpm test` 全部通过

---

## License

[MIT](./LICENSE)
