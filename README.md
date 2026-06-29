# game-designer-ts

> 与框架完全解耦的多智能体协作系统基座 —— 一个关于分层架构、智能体编排与可演进性的设计实验

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

---

## 设计出发点

构建一个**与具体 LLM 框架无关**的多智能体协作系统。核心命题不是"用 LangGraph 能做什么"，而是：

> 如果把 Agent 框架视为可替换的实现细节，业务逻辑应该长什么样？

这引出了三个设计目标：

1. **框架可替换**：今天用 LangGraph，明天可以换成 CrewAI、AutoGen 或自研运行时，核心代码一行不改。
2. **架构可验证**：分层边界不是靠文档约束，而是靠编译器和静态分析强制——`core/` 目录里找不到任何 `@langchain/*` 的 import。
3. **系统可演进**：新增一个子 Agent、一种记忆策略、一个审阅点，不需要触碰已有业务逻辑。

---

## 架构设计

### 分层模型

```
┌──────────────────────────────────────────────────┐
│              Port 接口层 (src/port/)               │
│  纯 TypeScript 接口，零外部依赖                      │
│  Agent · Model · Tool · Memory · Hook · Skill ·    │
│  Session · User · Queue · FileSystem · MCP · ...   │
├──────────────────────────────────────────────────┤
│              Core 业务层 (src/core/)                │
│  框架无关的纯业务逻辑，仅依赖 port/                    │
│  DirectorAgent · Pipeline · HITL · Hooks ·         │
│  LTM · Skill · Schema · Workspace · ...            │
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

### 核心约束

三条红线，由 `AGENTS.md` 强制执行：

| 规则 | 说明 |
|------|------|
| **core 不依赖 adapter** | `core/` 中禁止静态或动态 `import` 任何 `adapter/` 文件 |
| **core 不操作基础设施** | `core/` 中禁止使用 `fs`、`path`、`fetch` 等 API，一切通过 Port 抽象 |
| **config 不实例化 Adapter** | `config/` 只读取配置，依赖注入容器放在 `server/` |

这三条规则确保了依赖方向永远向内：`adapter → core → port`，不会出现反向依赖。

### Port 层设计

`src/port/` 定义了 14 个接口族，覆盖智能体系统的全部横切关注点：

| 接口族 | 核心契约 | 职责 |
|--------|---------|------|
| `agent/` | `AgentPort`, `AgentFactory`, `AgentDescriptor` | Agent 生命周期与工厂模式 |
| `model/` | `ChatModelPort` | LLM 调用抽象 |
| `tool/` | `ToolPort`, `ToolRegistry` | 工具注册与执行 |
| `memory/` | `MemoryPort`, `LongTermMemoryPort` | 会话记忆与长期记忆 |
| `hook/` | `AgentHook`, `HookPoint` | 生命周期拦截点 |
| `skill/` | `SkillPort`, `SkillRegistry` | 技能与工作流匹配 |
| `session/` | Session 管理 | 会话持久化 |
| `user/` | `TenantIsolationPort`, `UserPort` | 多租户与鉴权 |
| `fs/` | `FileSystemPort` | 文件系统抽象 |
| `mcp/` | `McpClientPort` | MCP 协议客户端 |
| `queue/` | `MessageQueuePort` | 消息队列 |
| `infra/` | `IdGeneratorPort` | ID 生成 |
| `tracing/` | 链路追踪 | 可观测性 |
| `message/` | `ChatMessage` | 消息数据结构 |

每个 Port 只定义"需要什么能力"，不关心"谁来提供"。Adapter 层负责填空。

---

## 多智能体编排

### DirectorAgent：中央编排器

`DirectorAgent` 是系统的指挥中心，支持三种执行模式：

```
design 模式（完整流程）
  Requirement → Skill 匹配 → Task 规划 → HITL 审阅
  → Router 路由 → Pipeline 执行 → Integrator 整合 → 产出

query 模式（直答）
  Requirement → 知识库工具注入 → 模型直答

table 模式（配表）
  复用 design 流程，产出为结构化配表数据
```

### 子 Agent 体系

系统内置 6 个领域子 Agent，每个拥有独立的 system prompt、工具集和执行边界：

| Agent | 职责域 |
|-------|--------|
| SystemDesigner | 系统架构设计 |
| CombatDesigner | 战斗系统设计 |
| NumericalPlanner | 数值规划 |
| GameplayDesigner | 玩法设计 |
| ExecutivePlanner | 执行规划 |
| QAPlanner | 质量审查 |

子 Agent 通过 `AgentFactory` 模式创建——编排器只知道工厂接口，不知道具体实现是 LangGraph 还是 Mock。

### Pipeline：依赖感知的并行执行

`PlanPipeline` 将任务按依赖关系拓扑排序，分层并行执行：

```
Layer 0: [Task A] [Task B]        ← 无依赖，并行
Layer 1: [Task C]                 ← 依赖 A、B，等它们完成
Layer 2: [Task D] [Task E]        ← 依赖 C，并行
```

每层内任务并行执行（`Promise.all`），层间串行。前置任务的输出自动注入为后继任务的上下文。支持 `AbortSignal` 优雅取消。

### Integrator：跨 Agent 冲突检测

不只是拼接输出。`Integrator` 提取各 Agent 产出的字段定义，检测跨域冲突（如同一属性被不同 Agent 赋予不同值），生成冲突报告，确保最终产出一致。

---

## 关键设计模式

### HITL（Human-in-the-Loop）

三个标准审阅点嵌入执行流程：

```
hitl-1-task-plan    → 任务规划完成后，人工确认/修改
hitl-2-agent-output → 单个 Agent 产出后，人工审阅
hitl-3-final        → 最终整合结果，人工验收
```

每个审阅点可独立开关，降级时返回 `fallback: true` 标记，**禁止静默通过**——所有自动化决策必须可审计。

### Hooks 系统

在 Agent 执行的关键阶段插入拦截点：

```
pre_reasoning  → post_reasoning
pre_tool_exec  → post_tool_exec
pre_agent_call → post_agent_call
on_error
on_iteration_budget
```

Hooks 实现上下文管理、记忆注入/抽取、流式事件发射、输出格式校验等横切关注点，与业务逻辑完全解耦。

### 长期记忆（LTM）

四类记忆独立管理：

| 类型 | 内容 | 策略 |
|------|------|------|
| 语义记忆 | 领域知识、概念 | 按相关性检索 |
| 情节记忆 | 历史会话摘要 | 按时间/重要性裁剪 |
| 程序记忆 | 工作流、方法论 | 按任务类型匹配 |
| 用户画像 | 偏好、习惯 | 持续更新 |

记忆的抽取和注入通过 Hooks 自动完成，对 Agent 透明。

### 流式输出

- **query 模式**：直接转发模型 token 流，零延迟
- **design 模式**：发送结构化进度事件（`plan` → `route` → `task_start` → `task_complete` → `integrate` → `chunk`），前端可渲染实时进度条

通过 `EventBus` + `concurrentDrain` 模式实现，每 200ms 轮询事件总线，**禁止**执行完成后伪分块模拟流式。

---

## 技术栈

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

## 项目结构

```
src/
├── port/          # 纯接口定义（14 个接口族）
├── core/          # 框架无关业务逻辑
│   ├── agent/     #   DirectorAgent + 子 Agent
│   ├── pipeline/  #   依赖感知的任务流水线
│   ├── hitl/      #   人工介入管理
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
│   ├── postgres/  #   PostgreSQL
│   ├── redis/     #   Redis
│   ├── betterauth/#   鉴权
│   ├── tavily/    #   联网搜索
│   ├── memory/    #   文件型记忆
│   ├── fs/        #   文件系统
│   └── infra/     #   基础设施
├── config/        # 配置加载（类型 + 读取，不实例化）
└── server/        # 组装根 + HTTP 服务
    ├── bootstrap.ts   # 依赖注入与启动
    ├── Container.ts   # DI 容器
    ├── app.ts         # Hono 应用
    ├── middleware/    # 鉴权中间件
    └── routes/        # 业务路由
prompts/           # 所有提示词（*.md）
test/              # 测试
```

---

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 至少填写：LLM_API_KEY、LLM_PROVIDER、LLM_MODEL

# 开发模式（热重载）
pnpm dev:all

# 运行测试
pnpm test

# 构建
pnpm run build
```

Docker 部署详见 [DEPLOY.md](./DEPLOY.md)。

---

## 开发规范

架构红线与提交自查清单详见 [AGENTS.md](./AGENTS.md)，核心要点：

- **依赖方向**：`core/` 不得依赖 `adapter/`，不得使用基础设施 API
- **配置注入**：提示词在组装根加载后注入，不在 core 层读取文件
- **降级可审计**：Adapter 降级行为必须返回可验证标记
- **验证标准**：`pnpm run build` + `pnpm test` 全部通过

---

## License

[MIT](./LICENSE)
