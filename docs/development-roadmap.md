# Game Designer TS — 增量开发路线图

> 参考 design-agent (Java/AgentScope 版本) 的业务功能、前端设计、交互逻辑，补充当前 TypeScript/LangGraph 版本的缺失能力。

---

## 一、现状对比分析

### 1.1 当前项目 (game-designer-ts) 已有能力

| 模块 | 状态 |
|------|------|
| Port/Adapter 架构 | ✅ 核心层与 LangGraph 适配器解耦 |
| DirectorAgent + 6 子 Agent | ✅ 基础实现 |
| HTTP API (Hono) | ✅ `/api/console/execute`, `/health` |
| 基础工具链 | ✅ GrepSearchTool, KnowledgeGraphTool, WikiPageTool |
| Hook 系统 | ✅ LoggingHook, ValidationHook, IterationBudgetHook, OutputEnforcementHook, ContextManagementHook |
| 前端框架 | ✅ Next.js 15 + React 19 + Tailwind v3 |
| 前端页面 | ✅ 控制台 (`/`) + 监控仪表盘 (`/dashboard`) |
| CORS | ✅ 已开启 |

### 1.2 参考项目 (design-agent) 的核心优势

> 状态更新于 2026-08-08：下表"当前状态"已对照代码核实（`src/core/hitl/`、`src/adapter/langgraph/LangGraphAgentAdapter.ts`、`src/server/routes/hitl.ts`、`src/server/bootstrap.ts` 等）。

| 能力 | 说明 | 当前状态 |
|------|------|---------|
| **HITL 人工审阅** | 3 个中断点（TaskPlan / 子 Agent 产出 / 最终整合），支持挂起→人工确认/修改/驳回→恢复 | ✅ 已实现（DurableHumanReviewGateway + Postgres 持久化 + 超时升级） |
| **需求澄清 (Clarify)** | Director 的多轮对话循环，自动追问模糊需求 | ❌ 未实现（仅残留 `clarify_*` 提示词与 `clarifying` 状态） |
| **流式输出 (Stream)** | LLM 响应实时流式返回，前端逐字显示 | ✅ 已实现（onTextDelta → 200ms 并发 drain → SSE chunk） |
| **会话状态持久化** | Session 状态保存，支持断点恢复 | ✅ 已实现（Postgres SessionRepository；文件型 SessionManager 已废弃） |
| **上下文自治管理** | Token 估算 → 阈值压缩 | ✅ 已实现（ContextManagementHook maybeCompress） |
| **技能/工作流系统** | 可热插拔的 Skill 模块，YAML frontmatter + Markdown 指令体 | ✅ 已启用（SkillManager/SkillLoader/WorkflowLoader + MVCC 快照） |
| **输出模板系统** | 每个子 Agent 有标准化的 Markdown 输出模板 | ✅ 提示词内模板（`system_design_output.md` 等）+ 工作区持久化 |
| **Prompt 加载器** | 从文件系统加载 `.md` 提示词，支持热重载 | ✅ 已实现（PromptLoader + /api/prompts 热重载） |
| **工作区管理** | Workspace 隔离、文件读写工具 | ✅ 已实现（租户级 `data/users/<userId>/workspace` + 文件浏览/下载） |
| **可观测性 (O11y)** | 链路追踪，Agent/LLM/Tool 调用上报 | ✅ 已实现（九态 Session/Trace/Span 落库 + /api/traces） |
| **配置表工具** | ConfigTableTool（确定性，0 幻觉） | ❌ 计划中 |
| **公式引擎** | FormulaEngine（确定性计算，可审计） | ❌ 计划中 |
| **前端 HITL 界面** | 审阅面板、状态指示器、操作按钮 | ✅ 已实现（review 页 + 挂起看板） |
| **前端设置页面** | 模型配置、参数调整、环境变量管理 | ✅ 已实现（settings 页，写回 .env） |
| **前端会话历史** | 历史会话列表、重新加载、对比 | ✅ 已实现（会话侧栏 + 恢复历史消息） |
| **前端流式展示** | SSE 实时接收、打字机效果 | ✅ 已实现（streamHandler + 步骤时间线） |
| **前端需求澄清** | 对话式追问、逐条确认、一键修改 | ❌ 未实现（随 Clarify 后端） |

---

## 二、开发优先级

### P0 — 核心交互（必须）
1. **流式输出 API + 前端实时展示**
2. **需求澄清循环 API + 前端对话式交互**
3. **HITL 审阅系统（后端状态机 + 前端审阅面板）**
4. **会话历史持久化 + 前端历史列表**

### P1 — 体验增强（重要）
5. **设置页面（模型配置、参数调整）**
6. **输出模板系统（子 Agent 标准化输出）**
7. **上下文自治管理（Token 估算 + 压缩/销毁）**
8. **Prompt 加载器优化（变量替换、热重载）**

### P2 — 高级功能（可选）
9. **可观测性集成（链路追踪控制台）**
10. **配置表工具 + 公式引擎**
11. **技能/工作流系统完整实现**
12. **工作区管理工具**

---

## 三、详细设计

### 3.1 流式输出 (Streaming)

**后端设计：**
- 新增 `POST /api/console/execute/stream` SSE 端点
- DirectorAgent 支持 streaming 模式，通过 EventSource 推送事件
- 事件类型：`start` → `clarify` → `plan` → `agent_start` → `agent_chunk` → `agent_end` → `integrate` → `complete` / `error`

**前端设计：**
- 使用 `EventSource` 接收 SSE 流
- 打字机效果逐字渲染（30ms/字符，可配置）
- 流式 Markdown 渲染（逐段解析，避免闪烁）
- Token 计数实时显示

### 3.2 需求澄清 (Clarify)

**后端设计：**
- DirectorAgent 新增 `clarify()` 方法
- 判定规则：Router 对需求进行信息充分性评分，低于阈值则进入澄清循环
- 返回 `clarify_questions` 数组，前端展示后用户回复，继续循环
- 最多 3 轮澄清，超时自动继续

**前端设计：**
- 需求输入后，如果返回 `type: "clarify"`，展示追问卡片
- 用户可逐条回答或一次性回答
- 确认后进入正式策划流程

### 3.3 HITL 审阅系统

**后端设计：**
- `HITLCheckpoint` 状态机：`PENDING` → `WAITING_REVIEW` → `APPROVED` / `REJECTED` / `MODIFIED` → `RESUMED`
- 新增端点：
  - `GET /api/hitl/checkpoints` — 列出待审阅的检查点
  - `POST /api/hitl/checkpoints/:id/review` — 提交审阅决定 `{ action: "approve" | "reject" | "modify", content?: string }`
  - `GET /api/hitl/checkpoints/:id` — 获取检查点详情
- 会话状态持久化到 `sessions/hitl-checkpoint/{sessionId}.json`

**前端设计：**
- 新增 `/review` 页面 — HITL 审阅中心
- 审阅卡片：展示待审内容、操作按钮（✅ 确认 / ❌ 驳回 / ✏️ 修改）
- 实时通知：新检查点到达时弹窗提示
- 修改模式：内联编辑器，支持 Markdown

### 3.4 会话历史

**后端设计：**
- `SessionManager` 管理会话元数据（id, createdAt, updatedAt, mode, status）
- 持久化到 `sessions/sessions.jsonl`
- 新增端点：
  - `GET /api/sessions` — 会话列表
  - `GET /api/sessions/:id` — 会话详情
  - `DELETE /api/sessions/:id` — 删除会话

**前端设计：**
- 控制台左侧可折叠会话侧边栏
- 历史列表：时间倒序，显示模式标签和首行需求预览
- 点击加载历史会话状态和结果

### 3.5 设置页面

**前端设计：**
- 新增 `/settings` 页面
- 配置项：
  - LLM 模型选择（provider, model, temperature, maxTokens）
  - HITL 开关（启用/禁用自动审阅）
  - 澄清轮数上限
  - 流式输出开关
  - 主题切换（预留）
- 配置保存到 `localStorage`，支持导出/导入

**后端设计：**
- `GET /api/settings` — 获取当前运行时配置（脱敏）
- `POST /api/settings` — 更新配置（需要重启生效的项标记为 readonly）

### 3.6 输出模板系统

**设计：**
- `templates/` 目录存放各子 Agent 的输出模板 `.md`
- 模板中包含占位符 `{{section_name}}`
- Integrator 根据模板拼接最终文档，确保格式一致性
- 前端根据模板渲染结构化输出（带目录导航）

---

## 四、数据模型

### 4.1 HITLCheckpoint

```typescript
interface HITLCheckpoint {
  id: string;
  sessionId: string;
  stage: 'plan' | 'subagent' | 'integrate';
  status: 'waiting_review' | 'approved' | 'rejected' | 'modified';
  content: string;           // 待审内容
  contentType: 'markdown' | 'json';
  agentName?: string;        // 子 Agent 名称（subagent 阶段）
  createdAt: string;
  reviewedAt?: string;
  reviewAction?: 'approve' | 'reject' | 'modify';
  reviewComment?: string;
  modifiedContent?: string;  // 人工修改后的内容
}
```

### 4.2 ClarifyRound

```typescript
interface ClarifyRound {
  round: number;
  questions: string[];
  answers?: string[];
  isComplete: boolean;
}
```

### 4.3 SessionMeta

```typescript
interface SessionMeta {
  id: string;
  requirement: string;
  mode: 'design' | 'query' | 'table';
  role: string;
  status: 'running' | 'waiting_hitl' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  output?: string;
  error?: string;
}
```

### 4.4 StreamEvent

```typescript
interface StreamEvent {
  type: 'start' | 'clarify' | 'plan' | 'agent_start' | 'agent_chunk' | 'agent_end' | 'hitl' | 'integrate' | 'complete' | 'error';
  sessionId: string;
  timestamp: string;
  payload: unknown;
}
```

---

## 五、API 端点规划

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/console/execute/stream` | SSE 流式执行 |
| POST | `/api/console/clarify` | 需求澄清（多轮） |
| GET | `/api/sessions` | 会话列表 |
| GET | `/api/sessions/:id` | 会话详情 |
| DELETE | `/api/sessions/:id` | 删除会话 |
| GET | `/api/hitl/checkpoints` | HITL 检查点列表 |
| GET | `/api/hitl/checkpoints/:id` | 检查点详情 |
| POST | `/api/hitl/checkpoints/:id/review` | 提交审阅 |
| GET | `/api/settings` | 运行时配置 |
| POST | `/api/settings` | 更新配置 |

---

## 六、前端页面规划

| 路径 | 页面 | 状态 |
|------|------|------|
| `/` | 控制台（含会话侧边栏 + 流式输出） | 升级 |
| `/dashboard` | 监控仪表盘 | 升级（加入 HITL 状态） |
| `/review` | HITL 审阅中心 | 新增 |
| `/settings` | 系统设置 | 新增 |

---

## 七、实现顺序

### Phase 1: 流式输出 + 前端体验升级
1. 后端 SSE 端点 `/api/console/execute/stream`
2. 前端 EventSource 接入 + 打字机效果
3. 前端 Token 计数 + 进度指示器

### Phase 2: 会话历史 + 持久化
4. `SessionManager` 后端实现
5. 前端会话侧边栏
6. 会话详情加载

### Phase 3: HITL 审阅系统
7. `HITLCheckpoint` 状态机后端
8. HITL API 端点
9. `/review` 前端页面
10. 控制台 HITL 状态指示器

### Phase 4: 需求澄清
11. Clarify 循环后端
12. 前端追问卡片交互

### Phase 5: 设置页面
13. `/settings` 前端页面
14. 配置持久化到 localStorage

### Phase 6: 输出模板 + 上下文管理
15. 模板加载器
16. Token 估算 + 压缩逻辑
