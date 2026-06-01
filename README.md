# game-designer-ts

多智能体游戏策划系统 - TypeScript 版本

## 项目简介

本项目是 [game-designer](https://github.com/WangHNoob/game-designer) 的 TypeScript 重构版本，采用 **Port/Adapter 架构**，实现框架无关的核心业务层，并以 LangGraph TypeScript 作为首个适配器。

## 架构设计

```
┌─────────────────────────────────────────────┐
│              业务核心层 (core/)                │
│  DirectorAgent, Pipeline, Schema, 业务逻辑    │
├─────────────────────────────────────────────┤
│         Port 接口层 (port/)                   │
│  AgentPort, ChatModelPort, ToolPort, etc.   │
├─────────────────────────────────────────────┤
│         Adapter 实现层 (adapter/)             │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ LangGraph Adapter│  │ Mock Adapter    │   │
│  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────┘
```

**核心原则**：
- `core/` 和 `port/` 零框架依赖
- `@langchain/*` 仅出现在 `adapter/langgraph/` 中
- 所有业务逻辑通过 Port 接口与框架解耦

## 技术栈

- **语言**: TypeScript 5.6 (Node.js >= 20)
- **框架**: LangGraph TypeScript
- **HTTP 服务**: Hono
- **测试**: Vitest
- **Lint**: ESLint + typescript-eslint
- **数据库**: PostgreSQL (O11y 后端)
- **缓存/消息**: Redis (O11y EventBus + 预留扩展)

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 复制环境变量模板并填写
# cp .env.example .env
# cp o11y/backend/.env.example o11y/backend/.env

# 启动全部服务（PostgreSQL + Redis + 后端 + 前端 + O11y）
docker-compose up --build

# 访问地址
# 主前端: http://localhost:3001
# 主后端 API: http://localhost:3000
# O11y 前端: http://localhost:3004
# O11y 后端 API: http://localhost:3003
```

### 方式二：本地开发

```bash
# 安装依赖
npm install
cd frontend && npm install && cd ..
cd o11y/frontend && npm install && cd ../..
cd o11y/backend
# 创建 Python 虚拟环境并安装依赖
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ../..

# 启动 PostgreSQL 和 Redis（需自行安装）
# 然后编译并运行
npm run build
npm run start:all
```

### 常用命令

```bash
# 编译
npm run build

# 运行测试
npm test

# 启动生产服务器
npm start

# 启动开发服务器（热重载）
npm run dev
```

## API 接口

### POST /api/console/execute

请求体:
```json
{
  "requirement": "设计一个RPG游戏的核心战斗系统",
  "sessionId": "optional-session-id",
  "mode": "design",
  "role": "chief_designer"
}
```

模式说明:
- `design`: 完整设计流程（技能匹配 → 任务规划 → 子Agent执行 → 整合）
- `query`: 知识库查询，直接返回模型响应
- `table`: 配表生成（复用 design 流程）

## 项目结构

```
src/
├── port/           # 框架无关核心接口
├── core/           # 业务核心层
├── adapter/        # 框架适配器
│   ├── langgraph/  # LangGraph TS 适配
│   └── mock/       # 测试用 Mock 适配
├── config/         # 配置与 DI 容器
└── server/         # HTTP 服务

test/
├── port/           # 接口契约测试
├── core/           # 业务逻辑测试
├── adapter/        # 适配器测试
└── integration/    # 端到端集成测试

o11y/
├── backend/        # O11y 后端 (FastAPI + PostgreSQL + Redis)
│   ├── app/
│   │   ├── core/   # 数据库、Redis、配置
│   │   ├── api/v1/ # REST API
│   │   └── events.py  # Redis pub/sub EventBus
│   └── Dockerfile
├── frontend/       # O11y 前端 (Next.js)
│   └── Dockerfile

frontend/           # 主前端 (Next.js)
└── Dockerfile
```

## Docker 服务说明

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| postgres | gdt-postgres | 5432 | PostgreSQL 数据库 |
| redis | gdt-redis | 6379 | Redis 缓存/消息 |
| backend | gdt-backend | 3000 | 主后端 API |
| frontend | gdt-frontend | 3001 | 主前端 |
| o11y-backend | gdt-o11y-backend | 3003 | O11y 后端 API |
| o11y-frontend | gdt-o11y-frontend | 3004 | O11y 前端 |

## 环境变量

```bash
# LLM 配置
LLM_PROVIDER=openai
LLM_API_KEY=sk-...

# HITL 配置
HITL_ENABLED=true

# O11y 数据库 (PostgreSQL)
DATABASE_URL=postgresql+asyncpg://o11y:o11y@localhost:5432/o11y

# Redis
REDIS_URL=redis://localhost:6379/0
```

## License

MIT
