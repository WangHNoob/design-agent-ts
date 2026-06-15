# game-designer-ts

> 多智能体游戏策划系统 —— TypeScript 版本｜与框架完全解耦的 Agent 基座

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org)

本项目是 [game-designer](https://github.com/WangHNoob/game-designer) 的 TypeScript 重构版本。核心业务层与任何 LLM 框架完全解耦，通过 **Port/Adapter** 分层让框架（LangGraph、Mock 等）成为可插拔的实现，同时内置一个完整的游戏策划多智能体系统：需求澄清 → 任务规划 → 路由分发 → 子 Agent 执行 → 整合产出，并支持人工介入（HITL）、长期记忆、知识库、技能/工作流、多租户与可观测性。

---

## 目录

- [核心特性](#核心特性)
- [架构设计](#架构设计)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [API 接口](#api-接口)
- [项目结构](#项目结构)
- [Docker 服务说明](#docker-服务说明)
- [环境变量](#环境变量)
- [开发规范](#开发规范)
- [License](#license)

---

## 核心特性

- **框架无关的核心层**：`core/` + `port/` 零框架依赖，`@langchain/*` 仅出现在 `adapter/langgraph/`。切换框架只需新增适配器，业务逻辑无需改动。
- **多智能体编排（DirectorAgent）**：
  - `TaskPlanner` 任务规划、`Router` 技能路由、`Integrator` 结果整合
  - 内置 6 个子 Agent：`SystemDesigner` / `CombatDesigner` / `NumericalPlanner` / `GameplayDesigner` / `ExecutivePlanner` / `QAPlanner`
  - 三种执行模式：`design`（完整设计流程）、`query`（知识库直答）、`table`（配表生成）
- **知识库工具链**：Wiki 页面检索、知识图谱节点查询、Grep 全文搜索、Tavily 联网搜索，支持工作区文件读写。
- **长期记忆（LTM）**：跨会话的语义 / 情节 / 程序 / 用户画像四类记忆，支持自动抽取、按重要性裁剪与上下文注入。
- **Hooks 系统**：在 `pre/post_reasoning`、`pre/post_tool_execution`、`pre/post_agent_call`、`on_error`、`on_iteration_budget` 等关键阶段统一拦截，实现上下文管理、记忆注入/抽取、流式发射、输出校验等。
- **HITL（Human-in-the-loop）**：标准审阅点 `hitl-1-task-plan` / `hitl-2-agent-output` / `hitl-3-final`，降级行为返回可审计的 `fallback` 标记，禁止静默通过。
- **技能与工作流**：`prompts/*.md` 统一管理提示词，技能/工作流在组装根加载并通过端口注入，可在运行时增删。
- **流式输出**：`query` 模式直传模型 token；`design` 模式发送结构化进度事件（`plan` / `route` / `task_start` / `task_complete` / `integrate` / `chunk`）。
- **多租户用户系统**：Better Auth（邮箱密码 + 钉钉 SSO）鉴权，所有业务数据（会话、记忆、设置、技能、工作流）按用户隔离，支持并发限制与自动管理员域名。
- **可观测性**：`/health` 健康检查、`/metrics` Prometheus 指标端点，配合 Prometheus + Grafana + Alertmanager 实现监控告警。
- **生产就绪**：PostgreSQL（pgvector）+ Redis 双持久化、每日自动备份、Docker Compose 一键编排。

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                  业务核心层 (src/core/)                        │
│  DirectorAgent · Pipeline · Hooks · LTM · Skill · Workspace   │
├─────────────────────────────────────────────────────────────┤
│                  Port 接口层 (src/port/)                      │
│  Agent · Model · Tool · Memory · Session · Skill · Hook ·     │
│  User · Queue · Tracing · FileSystem · Infra                  │
├─────────────────────────────────────────────────────────────┤
│               Adapter 实现层 (src/adapter/)                   │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ langgraph  │ │  mock    │ │ postgres │ │ redis         │ │
│  │ (LangChain)│ │ (测试用) │ │ (+LTM/   │ │ (MQ/租户隔离) │ │
│  │            │ │          │ │  Session)│ │               │ │
│  └────────────┘ └──────────┘ └──────────┘ └───────────────┘ │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ betterauth │ │ tavily   │ │   fs     │ │    infra      │ │
│  │ (鉴权)     │ │ (联网)   │ │ (文件)   │ │ (Id/Context)  │ │
│  └────────────┘ └──────────┘ └──────────┘ └───────────────┘ │
├─────────────────────────────────────────────────────────────┤
│          组装根 / HTTP 服务 (src/server/)                      │
│  bootstrap.ts · Container.ts · routes/* · middleware/*        │
├─────────────────────────────────────────────────────────────┤
│                  配置层 (src/config/)                         │
│  FrameworkConfig · loadConfig · validateConfig               │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**（详见 [AGENTS.md](./AGENTS.md)）：

- `core/` 与 `port/` **零框架依赖**，禁止 `import` 任何 `adapter/`、禁止使用 `fs`/`path`/`fetch` 等基础设施 API
- 所有基础设施能力（文件、网络、数据库、第三方服务）通过 Port 抽象，由 Adapter 实现，在组装根注入
- `config/` 只负责读取与类型定义，**不得**实例化任何 Adapter 具体类；依赖注入容器放在 `server/`

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript 5.9（Node.js >= 20，ESM） |
| Agent 框架 | LangGraph TypeScript（可替换适配器） |
| LLM | OpenAI / Anthropic / OpenAI 兼容协议 |
| HTTP 服务 | Hono |
| 数据库 | PostgreSQL 16 + pgvector（Drizzle ORM） |
| 缓存 / 消息队列 | Redis 7（消息队列基于 Redis Streams） |
| 鉴权 | Better Auth（邮箱密码 + 钉钉 SSO） |
| 前端 | Next.js 16 · React 19 · TailwindCSS · Zustand |
| 监控 | Prometheus · Grafana · Alertmanager |
| 测试 | Vitest |
| Lint / Format | ESLint · typescript-eslint · Prettier |
| 包管理 | pnpm（Workspace） |

---

## 快速开始

### 前置准备

1. Node.js >= 20、pnpm
2. 一个可用的 LLM API Key（OpenAI / Anthropic / 兼容协议）
3. 生产/多租户部署还需 PostgreSQL 与 Redis（本地开发可不启用用户系统）

### 方式一：Docker Compose（推荐，生产部署）

`docker-compose.yml` 编排了 postgres、redis、backend、frontend、prometheus、alertmanager、grafana 与 pg-backup 备份服务。

```bash
# 1. 复制环境变量模板并填写（LLM_API_KEY、BETTER_AUTH_SECRET、POSTGRES_PASSWORD 等必改项）
cp .env.example .env

# 2. （可选）本地预编译后打包进镜像，避免镜像内联网安装
pnpm install
pnpm run build
(cd frontend && pnpm install && pnpm run build)

# 3. 一键启动全部服务
docker compose up -d

# 4. 查看日志 / 健康检查
docker compose logs -f backend
curl http://localhost:13000/health
```

也可使用封装脚本：

```bash
node docker-start.mjs            # 启动已有镜像
node docker-start.mjs --rebuild  # 本地编译 → 打包进 Docker → 启动
node docker-start.mjs --down     # 停止并移除所有服务
node docker-start.mjs --logs     # 查看所有服务日志
```

> 完整的云服务器部署（含 HTTPS、Nginx 反代、Grafana、备份恢复、安全清单）请见 [DEPLOY.md](./DEPLOY.md)。

### 方式二：本地开发

```bash
# 安装依赖（含 workspace 前端）
pnpm install

# 复制并填写环境变量
cp .env.example .env
# 至少配置：LLM_API_KEY / LLM_PROVIDER / LLM_MODEL
# 如需多租户：USER_SYSTEM_ENABLED=true + PostgreSQL + Redis

# 一键启动前后端（热重载，改代码即生效）
pnpm dev:all

# 或者分别启动：
pnpm dev        # 后端（端口 4527，.env 的 PORT 决定）
pnpm dev:web    # 前端（端口 4528）
```

### 常用命令

```bash
pnpm dev:all            # 一键启动前后端（热重载）
pnpm dev                # 后端 TS 热重载（tsx watch）
pnpm dev:web            # 前端 Next.js 开发服务器
pnpm run build          # TypeScript 编译（类型检查 + 产物）
pnpm start              # 生产模式（需先 build）
pnpm test               # 运行全部测试（vitest）
pnpm run test:watch     # 测试监听模式
pnpm run lint           # ESLint 检查
pnpm run format         # Prettier 格式化
pnpm run db:generate    # 生成 Drizzle 迁移
pnpm run db:migrate     # 执行数据库迁移
```

---

## API 接口

所有业务接口默认位于 `/api/*` 下，启用用户系统后需要携带 Better Auth 的 Cookie 会话。

### POST `/api/console/execute`

同步执行一次策划任务。

请求体：

```json
{
  "requirement": "设计一个 RPG 游戏的核心战斗系统",
  "sessionId": "optional-session-id",
  "mode": "design",
  "role": "chief_designer",
  "history": [
    { "role": "user", "content": "之前的需求上下文（可选）" }
  ]
}
```

模式说明：

- `design`：完整设计流程（技能匹配 → 任务规划 → 子 Agent 执行 → 整合）
- `query`：知识库查询，直接返回模型流式响应
- `table`：配表生成（复用 design 流程）

### POST `/api/console/execute/stream`

SSE 流式版本，事件类型包括：`start` · `plan` · `route` · `task_start` · `task_complete` · `integrate` · `chunk` · `thinking` · `tool_start` · `tool_complete` · `knowledge_used` · `complete` · `error`。客户端断开会自动取消后端执行。

### POST `/api/console/cancel`

取消指定 session 正在执行的请求。

### 其他路由

| 路由 | 说明 |
|------|------|
| `/api/auth/*` | Better Auth 鉴权（注册 / 登录 / 登出 / 会话 / 钉钉 SSO） |
| `/api/sessions/*` | 会话管理（列表 / 详情 / 删除） |
| `/api/hitl/*` | 人工审阅交互 |
| `/api/settings/*` | 运行时配置（修改需校验无活跃执行） |
| `/api/prompts/*` | 提示词管理 |
| `/api/skills/*` | 技能管理 |
| `/api/workflows/*` | 工作流管理 |
| `/api/users/*` | 用户与租户信息 |
| `/health` | 健康检查（postgres / redis） |
| `/metrics` | Prometheus 指标 |

---

## 项目结构

```
game-designer-ts/
├── src/
│   ├── port/              # 框架无关核心接口（Agent/Model/Tool/Memory/Session/...）
│   ├── core/              # 业务核心层（仅依赖 port/）
│   │   ├── agent/         #   DirectorAgent + 6 个子 Agent
│   │   ├── pipeline/      #   PlanPipeline 规划流水线
│   │   ├── hitl/          #   人工介入管理
│   │   ├── hook/          #   Hooks 实现（流式/记忆/校验/上下文...）
│   │   ├── memory/        #   上下文管理 + 长期记忆
│   │   ├── schema/        #   领域模型（Role/TaskPlan/RouteDecision...）
│   │   ├── session/       #   会话管理
│   │   ├── settings/      #   运行时设置
│   │   ├── skill/         #   技能 / 工作流
│   │   ├── tool/          #   业务工具（知识库/工作区/DelegatingTool）
│   │   ├── user/          #   用户上下文
│   │   └── workspace/     #   工作区管理
│   ├── adapter/           # 框架与基础设施适配器
│   │   ├── langgraph/     #   LangGraph TS 适配（Agent/Model/Tool/Hook/Session...）
│   │   ├── mock/          #   测试用 Mock 适配
│   │   ├── betterauth/    #   Better Auth 鉴权
│   │   ├── postgres/      #   PostgreSQL（Database/LTM/Session + schema）
│   │   ├── redis/         #   Redis（消息队列 / 租户隔离）
│   │   ├── tavily/        #   Tavily 联网搜索
│   │   ├── memory/        #   文件型长期记忆
│   │   ├── fs/            #   Node 文件系统
│   │   └── infra/         #   Id 生成 / 上下文存储
│   ├── config/            # 配置加载与类型（不含实例化）
│   └── server/            # 组装根 + HTTP 服务
│       ├── bootstrap.ts   #   依赖组装 / 工具注册 / 启动
│       ├── Container.ts   #   依赖注入容器
│       ├── app.ts         #   Hono 应用与路由挂载
│       ├── middleware/    #   鉴权中间件
│       ├── routes/        #   各业务路由
│       ├── PromptLoader.ts
│       ├── SkillLoader.ts
│       └── WorkflowLoader.ts
├── frontend/              # 主前端（Next.js 16）
├── prompts/               # 所有提示词（*.md，子 Agent / Planner / Router）
├── knowledge/             # 知识库（wiki / processed 图谱 / gamedata / table_schemas）
├── config/                # 监控与缓存配置（prometheus / alertmanager / redis.conf）
├── scripts/               # 运维脚本（pg-backup.sh / pg-restore.sh）
├── drizzle/               # 数据库迁移
├── test/                  # 测试（port / core / adapter / integration）
├── docs/                  # 项目文档
├── docker-compose.yml     # 一键编排
├── Dockerfile             # 后端镜像（本地预编译模式）
└── AGENTS.md              # Agent 开发规范（架构红线 / Checklist）
```

---

## Docker 服务说明

| 服务 | 容器名 | 主机端口 | 说明 |
|------|--------|----------|------|
| postgres | gdt-postgres | 5432 | PostgreSQL 16 + pgvector |
| pg-backup | gdt-pg-backup | — | 每日 2:00 自动备份（保留天数由 `BACKUP_RETENTION` 控制） |
| redis | gdt-redis | 6379 | Redis 7（AOF + RDB 双持久化） |
| backend | gdt-backend | 13000 | 主后端 API（容器内 3000） |
| frontend | gdt-frontend | 3001 | 主前端（Next.js） |
| prometheus | gdt-prometheus | 9090 | 指标采集 |
| alertmanager | gdt-alertmanager | 9093 | 告警分发（飞书 / 钉钉 / 邮件） |
| grafana | gdt-grafana | 3002 | 监控面板 |

---

## 环境变量

完整字段见 [.env.example](./.env.example)，关键分组：

| 分组 | 关键变量 |
|------|---------|
| LLM | `LLM_PROVIDER` · `LLM_MODEL` · `LLM_API_KEY` · `LLM_BASE_URL` |
| 框架 | `AGENT_FRAMEWORK`（langgraph / mock） |
| HITL | `HITL_ENABLED` · `HITL_MAX_REVISIONS` · `HITL_TIMEOUT` · `HITL_AUTO_CONTINUE` |
| 知识库 | `KNOWLEDGE_WIKI_PATH` · `KNOWLEDGE_GRAPH_PATH` |
| 联网搜索 | `TAVILY_ENABLED` · `TAVILY_API_KEY` |
| 长期记忆 | `LTM_ENABLED` · `LTM_STORAGE_PATH` · `LTM_*`（抽取/裁剪/重要性阈值） |
| 用户系统 | `USER_SYSTEM_ENABLED` · `BETTER_AUTH_SECRET` · `BETTER_AUTH_BASE_URL` · `MAX_CONCURRENT_PER_USER` · `ADMIN_EMAIL_DOMAINS` |
| 钉钉 SSO | `DINGTALK_CLIENT_ID` · `DINGTALK_CLIENT_SECRET` · `ALLOW_EMAIL_PASSWORD` |
| 数据库 | `POSTGRES_URL` · `POSTGRES_USER/PASSWORD/DB` · `AUTO_INIT_SCHEMA` |
| Redis / 消息队列 | `REDIS_URL` · `MQ_ENABLED` · `MQ_CONSUMER_GROUP` |
| 服务端口 | `PORT` · `BACKEND_PORT` · `FRONTEND_PORT` · `API_BASE_URL` |
| 监控 | `GRAFANA_ADMIN_USER/PASSWORD` · `PROMETHEUS/ALERTMANAGER/GRAFANA_PORT` |

> 新增配置项必须同步修改 3 处：`src/config/FrameworkConfig.ts`、`src/config/loadConfig.ts`、`.env.example`。

---

## 开发规范

架构红线与提交自查清单详见 [AGENTS.md](./AGENTS.md)，要点：

- **依赖方向**：`core/` 不得静态或动态 `import` 任何 `adapter/`；不得使用 `fs`/`path`/`fetch`
- **配置注入**：提示词在 `bootstrap.ts` 统一加载后注入；新工具必须在组装根注册且名称与提示词一致
- **降级可审计**：Adapter 不得静默破坏 Port 契约，降级行为必须返回 `fallback` 标记
- **验证标准**：`pnpm run build` + `pnpm test` 通过，且能跑完 design / query / table 各一条 happy path

---

## License

[MIT](./LICENSE)
