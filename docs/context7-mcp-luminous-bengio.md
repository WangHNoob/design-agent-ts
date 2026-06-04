# 依赖升级到最新稳定版计划

## Context

用户请求将项目技术栈的各个组件版本升级到最新稳定版。经过架构分析和版本调研，发现：

1. **架构完全符合设计规范**：`src/core/` 和 `src/port/` 层零框架依赖，所有框架依赖集中在 `src/adapter/` 和 `src/server/` 层
2. **主要依赖需要升级**：
   - LangChain 系列从 0.x 升级到 1.x（主版本升级，有破坏性变更）
   - Hono 从 4.6 升级到 4.12（次版本升级，向后兼容）
   - Next.js 从 15.1/15.5 升级到 16.2（主版本升级，有破坏性变更）
   - 其他工具链和 UI 库升级到最新次版本
3. **关键风险点**：
   - `LangGraphModelAdapter.ts` 第 80 行使用了 `modelName` 属性，在 LangChain v1 中已改用 `model` 参数（构造函数），但实例属性访问需要验证
   - `o11y/frontend/package.json` 中 Next.js 版本硬编码为 `15.5.18`（无 `^` 约束）
   - Next.js 16 将 `middleware.ts` 重命名为 `proxy.ts`（但本项目未使用 middleware）

## 升级策略

按依赖层级和风险等级分阶段升级：

### 阶段 1：低风险工具链升级（零代码变更）
升级开发工具和类型定义，无运行时影响：
- TypeScript: `5.6.0` → `5.9.3`
- ESLint: `9.0.0` → `9.39.4`
- `@eslint/js`: `10.0.1` → `10.0.1`（已最新）
- `typescript-eslint`: `8.60.0` → `8.60.1`
- Vitest: `2.1.0` → `2.1.9`
- Prettier: `3.3.0` → `3.8.3`
- `@types/node`: `22.0.0` → `22.19.19`
- `globals`: `17.6.0` → `17.6.0`（已最新）

### 阶段 2：后端框架升级（需验证但代码变更少）

#### 2.1 Hono 升级（4.6 → 4.12）
- 根据 Context7 查询结果，Hono 严格遵循 Web Standards，4.x 系列向后兼容
- 代码变更：**无需变更**（仅版本号更新）
- 验证点：启动服务器，测试所有路由（`/api/sessions`、`/api/hitl`、`/api/settings`、`/api/console`）

#### 2.2 Zod 升级（3.23 → 3.25）
- Zod 3.25 是次版本升级，向后兼容
- 代码变更：**无需变更**

### 阶段 3：LangChain 系列升级（0.x → 1.x，需代码适配）

#### 3.1 版本映射
- `@langchain/core`: `0.3.80` → `1.1.48`
- `@langchain/langgraph`: `0.2.74` → `1.3.4`
- `@langchain/anthropic`: `0.3.34` → `1.4.0`
- `@langchain/openai`: `0.3.17` → `1.4.7`

#### 3.2 破坏性变更适配

根据 Context7 查询结果，LangChain v1 的关键变更：

**变更 1：构造函数参数名称变化**
- **位置**：`src/adapter/langgraph/LangGraphModelAdapter.ts` 第 25、31 行
- **问题**：构造函数中使用 `modelName` 参数
- **方案**：
  - ChatOpenAI: `modelName` → `model`
  - ChatAnthropic: `modelName` → `model`
- **代码变更**：
  ```typescript
  // 修改前
  new ChatOpenAI({ modelName: config.modelName, ... })
  new ChatAnthropic({ modelName: config.modelName, ... })
  
  // 修改后
  new ChatOpenAI({ model: config.modelName, ... })
  new ChatAnthropic({ model: config.modelName, ... })
  ```

**变更 2：实例属性访问**
- **位置**：`src/adapter/langgraph/LangGraphModelAdapter.ts` 第 80 行
- **问题**：`this.langchainModel.modelName` 用于获取模型名称
- **方案**：需要验证 v1 中实例属性名称
  - 如果 v1 保留 `modelName` 作为只读属性 → 无需变更
  - 如果 v1 移除该属性 → 改为访问 `model` 属性或在构造时缓存
- **风险缓解**：保留 `?? "unknown"` 降级逻辑

**变更 3：消息类型和 API（需验证，但预计兼容）**
- `BaseMessage`、`AIMessage`、`SystemMessage`、`HumanMessage`、`ToolMessage` 在 `@langchain/core/messages` 中
- 根据文档，消息类型 API 向后兼容，仅新增 `contentBlocks` 支持（可选）
- **验证点**：运行测试，确认 `LangGraphMessageMapper` 正常工作

**变更 4：StateGraph 和 ToolNode API（需验证）**
- `StateGraph`、`Annotation`、`START`、`END`、`MemorySaver`、`ToolNode` 在 `@langchain/langgraph` 中
- 文档未提及破坏性变更，预计向后兼容
- **验证点**：运行 director graph 测试

#### 3.3 适配文件清单
- `src/adapter/langgraph/LangGraphModelAdapter.ts` — 必改（构造函数参数）
- 其他 10 个 LangGraph 适配器文件 — 需验证，预计无需变更

### 阶段 4：前端框架升级（需特殊处理）

#### 4.1 React 和类型定义升级
- `react`: `19.0.0` → `19.2.7`（次版本，向后兼容）
- `react-dom`: `19.0.0` → `19.2.7`
- `@types/react`: `19.0.0` → `19.2.16`
- `@types/react-dom`: `19.0.0` → `19.2.3`
- **代码变更**：无需变更

#### 4.2 Next.js 升级（15.x → 16.2）

**关键决策**：根据 Context7 查询结果，Next.js 16 的主要变更是 `middleware.ts` → `proxy.ts`。经检查，本项目的两个前端（`frontend/` 和 `o11y/frontend/`）均未使用 middleware，因此该变更不影响本项目。

**升级步骤**：
1. 使用 Next.js 官方 codemod（可选）：
   ```bash
   cd frontend
   npx @next/codemod@latest upgrade
   cd ../o11y/frontend
   npx @next/codemod@latest upgrade
   ```
2. 手动修改 package.json：
   - `frontend/package.json`: `"next": "^15.1.0"` → `"next": "^16.2.7"`
   - `o11y/frontend/package.json`: `"next": "15.5.18"` → `"next": "16.2.7"`（移除硬编码，改用 `^`）

**验证点**：
- 启动两个前端开发服务器
- 测试核心页面渲染
- 检查 SSE 流式输出是否正常

#### 4.3 前端 UI 库升级
**frontend/ 包**：
- `framer-motion`: `11.18.0` → `12.40.0`
- `lucide-react`: `0.469.0` → `1.17.0`
- `zustand`: `5.0.14` → `5.0.14`（已最新）
- `react-markdown`: `9.0.1` → `10.1.0`
- `remark-gfm`: `4.0.0` → `4.0.1`
- `tailwindcss`: `3.4.17` → `3.4.19`
- `autoprefixer`: `10.4.20` → `10.5.0`
- `postcss`: `8.4.49` → `8.5.15`

**o11y/frontend/ 包**：
- `@radix-ui/react-scroll-area`: `1.2.10` → `1.2.10`（已最新）
- `@radix-ui/react-slot`: `1.2.4` → `1.2.4`（已最新）
- `@radix-ui/react-tabs`: `1.1.13` → `1.1.13`（已最新）
- `@radix-ui/react-tooltip`: `1.2.8` → `1.2.8`（已最新）
- `@tanstack/react-virtual`: `3.13.24` → `3.14.2`
- `class-variance-authority`: `0.7.1` → `0.7.1`（已最新）
- `clsx`: `2.1.1` → `2.1.1`（已最新）
- `date-fns`: `4.1.0` → `4.4.0`
- `lucide-react`: `1.14.0` → `1.17.0`
- `react-markdown`: `10.1.0` → `10.1.0`（已最新）
- `remark-gfm`: `4.0.1` → `4.0.1`（已最新）
- `swr`: `2.4.1` → `2.4.1`（已最新）
- `tailwind-merge`: `3.6.0` → `3.6.0`（已最新）
- `tailwindcss`: `3.4.17` → `3.4.19`
- `autoprefixer`: `10.4.20` → `10.5.0`
- `postcss`: `8.5.10` → `8.5.15`

**代码变更**：
- `framer-motion` 11→12 可能有破坏性变更，需查看 changelog
- `lucide-react` 0.x→1.x 主版本升级，需验证图标导入
- 其他均为次版本升级，向后兼容

## 实施步骤

### 步骤 1：升级根项目依赖
```bash
cd D:\game-designer-ts
pnpm update typescript@5.9.3 eslint@9.39.4 typescript-eslint@8.60.1 vitest@2.1.9 prettier@3.8.3 @types/node@22.19.19
pnpm update hono@4.12.23 @hono/node-server@2.0.4 zod@3.25.76
pnpm update @langchain/core@1.1.48 @langchain/langgraph@1.3.4 @langchain/anthropic@1.4.0 @langchain/openai@1.4.7
```

### 步骤 2：适配 LangChain v1 代码变更
- 修改 `src/adapter/langgraph/LangGraphModelAdapter.ts`：
  - 第 25 行：`modelName: config.modelName` → `model: config.modelName`
  - 第 31 行：`modelName: config.modelName` → `model: config.modelName`
  - 第 80 行：验证 `this.langchainModel.modelName` 是否仍可用，若不可用则改为访问 `this.langchainModel.model` 或在构造时缓存

### 步骤 3：升级 frontend/ 依赖
```bash
cd frontend
pnpm update next@16.2.7 react@19.2.7 react-dom@19.2.7 @types/react@19.2.16 @types/react-dom@19.2.3
pnpm update framer-motion@12.40.0 lucide-react@1.17.0 react-markdown@10.1.0 remark-gfm@4.0.1
pnpm update tailwindcss@3.4.19 autoprefixer@10.5.0 postcss@8.5.15
```

### 步骤 4：升级 o11y/frontend/ 依赖
```bash
cd ../o11y/frontend
# 先手动修改 package.json 中 next 版本：15.5.18 → ^16.2.7
pnpm update next@16.2.7 react@19.2.7 react-dom@19.2.7 @types/react@19.2.16 @types/react-dom@19.2.3
pnpm update @tanstack/react-virtual@3.14.2 date-fns@4.4.0 lucide-react@1.17.0
pnpm update tailwindcss@3.4.19 autoprefixer@10.5.0 postcss@8.5.15
```

### 步骤 5：编译和测试
```bash
cd D:\game-designer-ts
npm run build          # TypeScript 编译
npm test               # 运行测试套件
```

### 步骤 6：验证运行时行为
```bash
npm run start:all      # 启动后端 + 两个前端
```

**验证清单**：
- [ ] 后端服务启动成功（端口 4527）
- [ ] `/api/sessions` 可正常创建会话
- [ ] 发送 query 请求，LLM 正常响应
- [ ] 发送 design 请求，多 Agent 编排正常工作
- [ ] frontend/ 启动成功（端口 4528）
- [ ] o11y/frontend/ 启动成功（端口 3004）
- [ ] 前端 SSE 流式输出正常显示
- [ ] 前端 UI 无样式错误或布局崩溃

## 关键文件

### 必改文件
- `package.json` — 根项目依赖版本
- `frontend/package.json` — 前端依赖版本
- `o11y/frontend/package.json` — o11y 前端依赖版本（移除 next 硬编码）
- `src/adapter/langgraph/LangGraphModelAdapter.ts` — LangChain v1 API 适配

### 需验证但可能无需变更
- `src/adapter/langgraph/LangGraphAgentAdapter.ts` — StateGraph API
- `src/adapter/langgraph/LangGraphMessageMapper.ts` — 消息类型
- `src/adapter/langgraph/LangGraphToolAdapter.ts` — Tool API
- `src/adapter/langgraph/LangGraphDirectorGraph.ts` — Graph 构建
- `frontend/**/*.tsx` — framer-motion、lucide-react 使用点
- `o11y/frontend/**/*.tsx` — lucide-react 使用点

## 风险缓解

1. **LangChain v1 未知破坏性变更**：
   - 缓解：升级后立即运行完整测试套件
   - 降级方案：如遇不兼容问题，回退到 0.x 版本，等待官方稳定

2. **framer-motion 12.x 破坏性变更**：
   - 缓解：先查看 [framer-motion changelog](https://github.com/framer/motion/releases)
   - 降级方案：如有破坏性变更，保留 11.x 或适配代码

3. **lucide-react 1.x 图标导入变更**：
   - 缓解：编译失败时立即定位 import 错误
   - 降级方案：回退到 0.x 或按官方迁移指南适配

4. **Next.js 16.x 未知问题**：
   - 缓解：使用官方 codemod 自动迁移
   - 降级方案：如遇严重问题，回退到 15.x

## 排除项（核心层保持不变）

以下目录和文件**不会被修改**，符合用户"核心逻辑部分应该是框架无关的，不用动"的要求：
- `src/core/**/*` — 核心业务逻辑（零框架依赖）
- `src/port/**/*` — 端口接口定义（零框架依赖）
- `prompts/**/*.md` — 提示词文件
- `.env.example` — 配置模板
- `CLAUDE.md` — 项目规范文档
