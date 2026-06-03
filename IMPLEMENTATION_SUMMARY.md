# Implementation Summary: Agent Execution Monitoring Enhancement

## Completed Changes

### Backend (TypeScript/Node.js)

#### 1. EventBus Infrastructure
- **`src/core/agent/director/EventBus.ts`** (NEW)
  - Simple synchronous event queue
  - `emit()` for hooks to push events
  - `drain()` for DirectorAgent to collect accumulated events

#### 2. StreamEmitterHook
- **`src/core/hook/StreamEmitterHook.ts`** (NEW)
  - Priority: 200 (runs after O11yReportingHook)
  - Emits fine-grained events: `thinking`, `tool_start`, `tool_complete`, `knowledge_used`
  - Extracts knowledge sources from tool metadata
  - Tracks execution timing for tools

#### 3. Tool Metadata Preservation
- **`src/adapter/langgraph/LangGraphToolAdapter.ts`**
  - Added `lastToolMetadata` Map to cache metadata from ToolResult
  - Prevents metadata loss at adapter boundary

- **`src/adapter/langgraph/LangGraphAgentAdapter.ts`**
  - Modified `wrappedToolNode` to pass metadata to post_tool_execution hook
  - Enables StreamEmitterHook to access tool result metadata

#### 4. DirectorAgent Integration
- **`src/core/agent/director/DirectorAgent.ts`**
  - Extended StreamEvent type union with 4 new event types
  - Added KnowledgeSource interface
  - `executeQueryStream()`: Creates EventBus + StreamEmitterHook, drains after execution
  - `executeDesignStream()`: Drains EventBus after each task and integrate phase
  - Added helper methods: `createQueryAgentWithHooks()`, `executeSingleTaskWithHooks()`

#### 5. SSE Forwarding
- **`src/server/routes/console.ts`**
  - Added default case to forward new event types: `thinking`, `tool_start`, `tool_complete`, `knowledge_used`

#### 6. Prompt Enhancement
- **`prompts/query_knowledge.md`**
  - Added "输出格式" section requiring knowledge source attribution
  - Specifies format for citing Wiki pages, KG nodes, grep matches, and web results

### Frontend (Next.js/React)

#### 1. New Components

**`frontend/components/Console/StepsTimeline.tsx`** (NEW)
- Hierarchical timeline display
- Task entries with nested tool calls
- Expandable/collapsible tree structure
- Status icons: running (pulse), completed (✓), error (✗), pending (○)
- Duration display for completed operations

**`frontend/components/Console/DetailedLogs.tsx`** (NEW)
- Log level filtering (debug/info/warn/error)
- Source filtering (by agent/tool name)
- Expandable structured data (JSON)
- Compact display with smart truncation

#### 2. RightPanel Refactor
- **`frontend/components/Console/RightPanel.tsx`**
  - Removed "Agent" tab
  - Kept 2 tabs: "步骤" (Steps/Timeline) and "日志" (Logs)
  - Updated props to use TimelineEntry[] and DetailedLog[]

#### 3. Main Page State Refactor
- **`frontend/app/page.tsx`**
  - Replaced flat `steps` and `rawAgentStatuses` with hierarchical `timeline`
  - Enhanced `logs` to use DetailedLog model (level, source, data, durationMs)
  - Added `knowledgeSources` accumulator
  - Added refs: `activeTaskRef`, `taskEntriesRef` for event correlation

#### 4. Event Handler Enhancement
- `handleStreamEvent()` now processes 4 new event types:
  - `thinking`: Updates debug logs with iteration progress
  - `tool_start`: Creates tool timeline entry nested under active task
  - `tool_complete`: Updates tool entry with status and duration
  - `knowledge_used`: Accumulates knowledge sources
- Helper functions: `mapDomainToAgentName()`, `summarizeToolArgs()`

#### 5. Deleted Components
- **`frontend/components/Console/AgentStatusCards.tsx`** - No longer needed

---

## Architecture Highlights

### Event Flow
```
Hook Point (pre_tool_execution)
  ↓
StreamEmitterHook.onEvent()
  ↓
EventBus.emit()
  ↓
[Accumulates in queue]
  ↓
DirectorAgent (after task execution)
  ↓
EventBus.drain()
  ↓
yield events to SSE stream
  ↓
Frontend handleStreamEvent()
  ↓
Update Timeline + Logs state
```

### Timeline Hierarchy
```
Timeline Entry (Phase: "开始执行")
Timeline Entry (Task: "设计成就系统")
  ├─ Tool Entry (wiki_lookup: "成就")
  ├─ Tool Entry (wiki_read: "systems/成就系统.md")
  └─ Tool Entry (kg_query_node: "achievement_system")
Timeline Entry (Phase: "整合结果")
Timeline Entry (Complete: "执行完成")
```

### Knowledge Attribution
- Backend: StreamEmitterHook extracts sources from tool metadata
- Frontend: Accumulates in `knowledgeSources` state
- Prompt: Instructs agents to cite sources in output
- (Future: Display sources as footnotes in chat bubbles)

---

## Testing Checklist

### Backend
- [x] TypeScript compilation passes
- [ ] Query mode: tool events emitted during wiki_lookup/wiki_read
- [ ] Design mode: task_start/tool_start/tool_complete events for each sub-agent
- [ ] Tool metadata preserved through adapter layers
- [ ] EventBus drains at correct points (after tasks, after integrate)

### Frontend
- [x] TypeScript/Next.js build passes
- [ ] Timeline shows hierarchical task → tool structure
- [ ] Tool entries expandable to show args/results
- [ ] Logs filterable by level (debug hidden by default)
- [ ] Logs filterable by source (agent/tool names)
- [ ] Duration displayed for completed tools
- [ ] Knowledge sources accumulate during execution

### Integration
- [ ] Start backend: `npm run dev`
- [ ] Start frontend: `cd frontend && npm run dev`
- [ ] Send query: "成就系统的触发条件有哪些？"
- [ ] Verify timeline shows wiki_lookup, wiki_read tool calls
- [ ] Verify logs show tool arguments and results
- [ ] Verify AI response includes "📚 参考来源" section
- [ ] Send design request: "设计一个新手引导系统"
- [ ] Verify timeline shows multiple tasks with nested tools
- [ ] Verify O11y dashboard still receives spans (EventBus doesn't break O11y)

---

## Key Design Decisions

1. **EventBus over async channels**: Synchronous queue drained at deterministic points avoids concurrency issues
2. **Hook-driven**: Reuses existing Hook system, no invasive changes to LangGraph internals
3. **Metadata via Map**: Instance-level cache avoids static state, safe for concurrent requests
4. **Timeline over flat steps**: Hierarchical model matches mental model (tasks contain tools)
5. **2 tabs not 3**: "Steps" absorbs "Agent" information, cleaner UI

---

## Future Enhancements

1. **Knowledge source display**: Render `knowledgeSources` as footnotes in chat bubbles
2. **Real-time progress**: Show "thinking" iteration count in timeline entry detail
3. **Tool result preview**: Click tool entry to view full args/result in modal
4. **Export timeline**: Download execution trace as JSON for debugging
5. **Replay mode**: Load saved timeline from session history
