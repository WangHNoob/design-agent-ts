// Port 接口层 — 消息模型
export type { MessageRole } from "./port/message/MessageRole.js";
export type { ContentBlock, TextContent, ToolCallContent, ToolResultContent } from "./port/message/ContentBlock.js";
export type { ChatMessage } from "./port/message/ChatMessage.js";
export { ChatMessage as ChatMessageUtils } from "./port/message/ChatMessage.js";

// Port 接口层 — Agent
export type { AgentDescriptor } from "./port/agent/AgentDescriptor.js";
export type { AgentResponse } from "./port/agent/AgentResponse.js";
export { AgentResponse as AgentResponseUtils } from "./port/agent/AgentResponse.js";
export type { AgentPort } from "./port/agent/AgentPort.js";
export type { AgentFactory } from "./port/agent/AgentFactory.js";

// Port 接口层 — 模型
export type { ModelOptions } from "./port/model/ModelOptions.js";
export { ModelOptions as ModelOptionsDefaults } from "./port/model/ModelOptions.js";
export type { ModelResponse } from "./port/model/ModelResponse.js";
export type { ChatModelPort } from "./port/model/ChatModelPort.js";

// Port 接口层 — 工具
export type { ParameterDescriptor, ToolDescriptor } from "./port/tool/ToolDescriptor.js";
export type { ToolResult } from "./port/tool/ToolResult.js";
export { ToolResult as ToolResultUtils } from "./port/tool/ToolResult.js";
export type { ToolPort } from "./port/tool/ToolPort.js";
export type { ToolRegistry } from "./port/tool/ToolRegistry.js";
export type { ToolFailureDecision, ToolFailurePolicy } from "./port/tool/ToolFailurePolicy.js";
export {
  DEFAULT_TOOL_FAILURE_POLICY,
  DEFAULT_EXTERNAL_TOOL_FAILURE_POLICY,
} from "./port/tool/ToolFailurePolicy.js";

// Port 接口层 — Eval
export type {
  EvalMode,
  MetricKind,
  EvalMetric,
  EvalCase,
  EvalBaseline,
  EvalDataset,
  EvalTask,
  EvalScore,
  EvalReport,
} from "./port/eval/types.js";
export type { EvalStorePort } from "./port/eval/EvalStorePort.js";
export type { ScorerPort, ScoreInput, ScoreResult } from "./port/eval/ScorerPort.js";

// Port 接口层 — 记忆
export type { MemoryPort } from "./port/memory/MemoryPort.js";

// Port 接口层 — Hook
export type { HookPoint } from "./port/hook/HookPoint.js";
export type { HookContext } from "./port/hook/HookContext.js";
export { HookContext as HookContextUtils } from "./port/hook/HookContext.js";
export type { AgentHook } from "./port/hook/AgentHook.js";

// Port 接口层 — 会话
export type { SessionKey } from "./port/session/SessionKey.js";
export type { SessionPort } from "./port/session/SessionPort.js";

// Port 接口层 — 技能
export type { SkillWorkflow, SkillPort } from "./port/skill/SkillPort.js";
export type { SkillRegistry } from "./port/skill/SkillRegistry.js";

// Port 接口层 — 追踪
export type { SpanContext, TracerPort, TraceHandle, TraceRuntimeState } from "./port/tracing/TracerPort.js";
export type { TraceStorePort } from "./port/tracing/TraceStorePort.js";
export type { TraceExporter } from "./port/tracing/TraceExporter.js";
export type {
  SpanPhase,
  SpanRecord,
  TraceRecord,
  TraceSessionRecord,
  TraceDetail,
} from "./port/tracing/types.js";
export { NINE_SPAN_PHASES, isSpanPhase } from "./port/tracing/types.js";
