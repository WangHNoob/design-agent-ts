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

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行测试
npm test

# 启动开发服务器
npm run dev

# 启动生产服务器
npm start
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
```

## 环境变量

```bash
# LLM 配置
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# HITL 配置
HITL_ENABLED=true
```

## License

MIT
