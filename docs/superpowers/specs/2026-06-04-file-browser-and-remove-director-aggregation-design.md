# 文件浏览器与主策划聚合层移除设计

**日期**: 2026-06-04  
**分支**: `dev`  
**状态**: ⚠️ **部分否决（2026-08-08）**：文件浏览器/下载部分已实施（`src/server/routes/sessions.ts` + 前端 FileBrowserPanel）；**"移除主策划聚合层"部分已否决，不实施**——Director 保留 Integrator 聚合输出与 HITL-2/3，以 `README.md` 描述的现状为准。

---

## 1. 目标

在当前 `game-designer-ts` 项目中实现以下两个能力：

1. **文件浏览器与下载**：前端提供工作空间文件浏览器，支持查看子 Agent 产出、单文件下载、选中批量下载、全部打包 ZIP 下载，且文件命名规范可读。
2. **移除主策划聚合层**：主策划（Director 多角色流程）不再把各子 Agent 输出合并成一篇长文档，而是把每个子 Agent 的产出直接写入 workspace；执行完成后仅向前端返回摘要与下载指引，用户通过文件浏览器自行下载全部产出。

**补充约束**：非主策划的其他单角色/单任务模式（如 combat_designer、gameplay_designer 等）仍保持现有行为——其输出继续在前端渲染展示，同时提供下载入口。

---

## 2. 关键决策

| 决策点 | 选择 | 原因 |
|--------|------|------|
| 主策划是否有最终聚合文档 | **否** | 主策划输出是“所有子 Agent 产出的 ZIP 包”，不再生成单一大段合并 Markdown。 |
| 单角色模式输出展示 | **继续前端渲染** | 单任务产出长度可控，直接阅读体验好；同时提供下载按钮。 |
| 子 Agent 输出命名 | `<taskId>_<domainDisplayName>/output.md` | 参考 `D:\design-agent\game-designer`，可读、可排序、避免冲突。 |
| 文件浏览器位置 | **右侧监控面板的“文件”标签页** | 与现有“执行步骤/详细日志”并列，不破坏聊天主流程。 |
| HITL 审阅点 | 保留 `hitl-1-task-plan`；**移除 `hitl-2-agent-output` 和 `hitl-3-final`** | 没有聚合最终产物需要审阅，子 Agent 输出由用户自行下载后审阅。 |
| ZIP 打包范围 | 当前 session 的 workspace 下所有任务 `output.md` | 最简实现，满足“主策划产出打包下载”。 |

---

## 3. Workspace 目录结构

```text
workspace/<sessionId>/
  <taskId>_<domainDisplayName>/
    output.md
```

示例：

```text
workspace/gdt-20260604-xxxx/
  TASK-001_玩法设计/
    output.md
  TASK-002_数值规划/
    output.md
  TASK-003_系统策划/
    output.md
```

- `WorkspaceManager` 内部维护 `taskId -> 目录名` 映射。
- 写入时自动创建带 domain 的目录。
- 读取/列出时兼容旧目录（纯 `taskId`）和新目录（`taskId_domain`）。

---

## 4. 后端 API 设计

在 `src/server/routes/sessions.ts` 新增以下路由：

### 4.1 列出文件树

```
GET /api/sessions/:sessionId/files
```

响应：

```json
{
  "sessionId": "gdt-20260604-xxxx",
  "tasks": [
    {
      "taskId": "TASK-001",
      "domain": "玩法设计",
      "path": "TASK-001_玩法设计",
      "files": [
        {
          "name": "output.md",
          "size": "12.3 KB",
          "downloadUrl": "/api/sessions/gdt-20260604-xxxx/files/download?path=TASK-001_玩法设计/output.md"
        }
      ]
    }
  ]
}
```

### 4.2 单文件下载

```
GET /api/sessions/:sessionId/files/download?path=<relativePath>
```

- `Content-Type` 根据扩展名决定；`.md` 可返回 `text/markdown; charset=utf-8` 供前端预览，或 `application/octet-stream` 强制下载。
- `Content-Disposition` 设置为 `attachment; filename="..."`。

### 4.3 全部打包 ZIP

```
GET /api/sessions/:sessionId/files/zip
```

- 遍历该 session 的 workspace 下所有任务的 `output.md`。
- ZIP 中的路径保持 `TASK-001_玩法设计/output.md` 结构。
- 响应头：
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename="design-output-<sessionId>.zip"`

### 4.4 选中批量 ZIP（可选增强）

```
POST /api/sessions/:sessionId/files/zip
Body: { "paths": ["TASK-001_玩法设计/output.md", ...] }
```

- 若前端用“依次触发多个单文件下载”方案，则此项可暂缓。

---

## 5. 前端设计

### 5.1 右侧面板新增“文件”标签

在 `frontend/components/Console/RightPanel.tsx` 中增加第三个标签：

- **执行步骤**（现有）
- **详细日志**（现有）
- **工作空间文件**（新增）

### 5.2 文件浏览器组件 `FileBrowserPanel`

功能：

- 顶部工具栏：
  - 全选 Checkbox
  - “打包下载全部”按钮（链接到 `/api/sessions/:id/files/zip`）
- 文件列表（每行）：
  - 选择 Checkbox
  - 📄 文件图标
  - 文件路径（如 `TASK-001_玩法设计/output.md`）
  - 文件大小
  - “下载”链接
- 底部操作栏：
  - “下载选中”按钮

交互：

- 单文件下载：直接 `<a>` 触发。
- 批量下载选中：依次创建隐藏 `<a>` 并点击，间隔 300ms，避免浏览器阻塞。
- 组件挂载时自动调用 `/api/sessions/:id/files` 刷新列表。
- 执行完成后，SSE `complete` 事件触发列表刷新。

### 5.3 聊天区输出展示策略

根据 `role` 区分：

| 模式 | 前端行为 |
|------|----------|
| `chief_designer`（主策划） | 渲染 Director 返回的摘要 Markdown（含任务数、下载指引），不提供长篇内容。右侧文件浏览器自动切换到“工作空间文件”标签高亮。
| 其他单角色 | 继续渲染完整 `output` Markdown；同时在该消息气泡旁显示 📥 下载按钮，可下载该次产出的 `output.md`。 |

---

## 6. Director 改造

### 6.1 主策划流程

修改 `src/core/agent/director/DirectorAgent.ts`：

1. 在 `executeSingleTask` 调用前注册任务目录：
   ```ts
   this.deps.workspace?.registerTaskDir(sessionId, task.taskId, task.domain);
   ```
2. `executeSingleTask` 继续把子 Agent 输出写入 `output.md`。
3. 执行完所有子任务后：
   - **移除** `this.integrator.integrate(...)` 调用。
   - **移除** `hitl-2-agent-output` 与 `hitl-3-final` 审阅点（或默认跳过）。
   - 构造轻量 Markdown 返回：
     ```markdown
     ## ✅ 策划方案已生成

     共完成 **N** 个子任务，所有产出已保存到工作空间：

     - TASK-001_玩法设计/output.md
     - TASK-002_数值规划/output.md
     - TASK-003_系统策划/output.md

     📂 请在右侧「工作空间文件」面板中选择并下载所需文档。  
     📦 也可以直接点击「打包下载全部」获取 ZIP。
     ```

### 6.2 单角色流程

`executeSingleRoleFlow` 保持现有行为：

- 输出继续写入 workspace。
- 返回完整 `output` 给前端渲染。
- 前端在该消息旁提供下载按钮。

### 6.3 Integrator 处理

`Integrator.ts` 暂时保留但不再被 `DirectorAgent` 调用，避免破坏现有测试引用。后续可彻底移除。

---

## 7. 数据流

### 主策划模式

```
用户输入
  -> DirectorAgent
    -> TaskPlanner.plan()          [hitl-1 审阅]
    -> Router.route()
    -> PlanPipeline.execute()
         -> 每个子任务
              -> registerTaskDir(session, taskId, domain)
              -> LangGraphAgentAdapter.process()
              -> workspace.writeTaskOutput(..., "output.md", output)
    -> 构造摘要消息
    -> SSE complete { output: 摘要, sessionId }
  -> 前端
    -> 渲染摘要
    -> 右侧 FileBrowserPanel 刷新并展示文件列表
    -> 用户选择下载 / 打包下载
```

### 单角色模式

```
用户输入
  -> DirectorAgent.executeSingleRoleFlow()
    -> 单 Agent 执行
    -> workspace.writeTaskOutput(session, "single", "output.md", output)
    -> 返回完整 output
  -> 前端
    -> 渲染完整 Markdown
    -> 消息旁显示下载按钮
```

---

## 8. 错误处理

- **文件列表为空**：文件浏览器显示“暂无产出”，并提供刷新按钮。
- **下载失败**：显示 Toast / alert，提示用户重试。
- **ZIP 生成失败**：返回 500，前端提示错误。
- **旧 session 兼容**：`listTasks` 同时识别旧目录名（纯 `taskId`）和新目录名（`taskId_domain`）。

---

## 9. 验收标准

1. `npm run build` 通过。
2. `npm test` 通过（更新或移除与 `Integrator` 相关的断言）。
3. 主策划模式：执行完成后聊天区仅显示摘要，右侧文件浏览器列出所有子 Agent 的 `output.md`，可单文件下载、批量下载、打包 ZIP 下载。
4. 单角色模式：执行完成后聊天区仍渲染完整输出，且提供该次产出的下载入口。
5. 文件命名符合 `<taskId>_<domain>/output.md` 规范。
6. ZIP 包内路径与 workspace 结构一致。
7. HITL-1 仍可正常审阅；HITL-2 / HITL-3 不再阻塞主策划流程。

---

## 10. 受影响文件清单

| 文件 | 变更 |
|------|------|
| `src/core/workspace/WorkspaceManager.ts` | 支持 `registerTaskDir`、带 domain 的目录名、兼容旧目录。 |
| `src/core/agent/director/DirectorAgent.ts` | 注册任务目录、移除 `integrate()` 调用、返回摘要消息、跳过 HITL-2/3。 |
| `src/core/agent/director/Integrator.ts` | 不再被调用，可保留或后续移除。 |
| `src/port/fs/FileSystemPort.ts` | 若需要新增文件状态（size、mtime）查询则扩展。 |
| `src/server/routes/sessions.ts` | 新增 `/files`、`/files/download`、`/files/zip` 路由。 |
| `frontend/components/Console/RightPanel.tsx` | 新增“工作空间文件”标签。 |
| `frontend/components/Console/FileBrowserPanel.tsx` | 新增文件浏览器组件。 |
| `frontend/components/Console/ResultPanel.tsx` 或消息气泡 | 单角色模式增加下载按钮。 |
| `frontend/lib/stores/taskStore.ts` | 可能需要新增文件列表状态与刷新动作。 |
| `test/core/agent/director/DirectorAgent.test.ts` | 更新断言以匹配新的返回消息格式。 |

---

## 11. 后续可扩展

- 支持 `.docx` 导出（当前项目仅 `.md`）。
- 文件浏览器支持子目录递归、图片预览。
- 选中批量 ZIP 接口（`POST /files/zip`）。
- 为单角色模式的下载生成更友好的文件名（如 `combat-design-output.md`）。
