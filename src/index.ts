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
export type { CompensateHandler, CompensateContext } from "./port/tool/ToolCompensate.js";
export type {
  CompensateFailureQueuePort,
  CompensateFailureRecord,
} from "./port/saga/CompensateFailureQueuePort.js";
export { SagaCoordinator } from "./core/saga/SagaCoordinator.js";
export type {
  SagaCoordinatorOptions,
  SagaCompensateSummary,
  SagaJournalEntry,
} from "./core/saga/SagaCoordinator.js";
export { InMemoryCompensateFailureQueue } from "./core/saga/InMemoryCompensateFailureQueue.js";
export { AuditCompensateFailureQueue } from "./core/saga/AuditCompensateFailureQueue.js";
export { CancellationHook } from "./core/hook/CancellationHook.js";
export {
  buildCancellationPayload,
  isCancellationScenario,
} from "./core/execution/CancellationPayload.js";
export type {
  CancellationStreamPayload,
  CancelledTaskSummary,
} from "./core/execution/CancellationPayload.js";

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
export type { MemoryPort, ArchiveEntry } from "./port/memory/MemoryPort.js";
export type { SummarizerPort } from "./port/memory/SummarizerPort.js";
export { ContextManager } from "./core/memory/ContextManager.js";
export type { ContextManagerOptions, CompressResult } from "./core/memory/ContextManager.js";
export { SlidingWindowMemoryPort } from "./core/memory/SlidingWindowMemoryPort.js";
export type { SlidingWindowMemoryOptions } from "./core/memory/SlidingWindowMemoryPort.js";
export { HeuristicSummarizer } from "./core/memory/HeuristicSummarizer.js";
export { InMemoryMemoryPort } from "./core/memory/InMemoryMemoryPort.js";
export { ContextManagementHook } from "./core/hook/ContextManagementHook.js";
export type { ContextManagementHookOptions } from "./core/hook/ContextManagementHook.js";

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

// Port 接口层 — 版本化 (Prompt / Skill / Workflow MVCC)
export type {
  ArtifactKind,
  ArtifactVersion,
  VersionBinding,
  VersionSnapshot,
  UpsertArtifactVersionInput,
  ReleaseConfig,
  RollbackInput,
} from "./port/versioning/types.js";
export type { VersionStorePort } from "./port/versioning/VersionStorePort.js";
export { InMemoryVersionStore } from "./core/versioning/InMemoryVersionStore.js";
export { VersionedSkillRegistry } from "./core/versioning/VersionedSkillRegistry.js";
export { selectCanaryVersion, hashToPercent } from "./core/versioning/selectCanaryVersion.js";
export { buildExecutionOverrides } from "./core/versioning/buildExecutionOverrides.js";
export type { ExecutionOverrides } from "./core/versioning/buildExecutionOverrides.js";

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

// Port 接口层 — 审计
export type { AuditAction, AuditOutcome, AuditEntry, AppendAuditInput, AuditListOptions } from "./port/audit/types.js";
export type { AuditStorePort } from "./port/audit/AuditStorePort.js";

// Port 接口层 — 成本与限流
export type {
  CostGroupDimension,
  RateLimitCode,
  CostUsageRecord,
  CostAggregate,
  CostAggregateOptions,
  TopSpendersOptions,
  RateLimitRemaining,
} from "./port/cost/types.js";
export type { CostStorePort } from "./port/cost/CostStorePort.js";
export type {
  RateLimitCheckInput,
  RateLimitResult,
  RateLimitPort,
} from "./port/cost/RateLimitPort.js";

// Port 接口层 — 工具安全
export type { ToolRiskLevel } from "./port/tool/ToolRiskLevel.js";
export type { ToolApprovalPort, ToolApprovalKey, GrantToolApprovalInput } from "./port/tool/ToolApprovalPort.js";

// Plan 硬保障（范式二：步骤白名单 / 重规划预算 / 跳步拒绝）
export {
  PlanHardGuard,
  PlanViolationError,
  isPlanViolationError,
  PlanReplanExhaustedError,
  isPlanReplanExhaustedError,
  canReplan,
  assertWithinReplanBudget,
  PlanReplanner,
  validateRemainingTasks,
  runPlanWithReplan,
  DEFAULT_DOMAIN_TOOL_WHITELIST,
  DEFAULT_READ_TOOLS,
  resolveDomainDefaultTools,
} from "./core/plan/index.js";
export type {
  PlanHardGuardOptions,
  PlanReplannerOptions,
  ReplanInput,
  RunPlanWithReplanOptions,
  RunPlanWithReplanResult,
} from "./core/plan/index.js";
export { ToolWhitelistWrapper, WhitelistToolRegistry } from "./core/tool/ToolWhitelistWrapper.js";
export type { ToolWhitelistOptions } from "./core/tool/ToolWhitelistWrapper.js";
export type { DirectorPlanHardConfig, DirectorMultiAgentConfig } from "./core/agent/director/DirectorAgent.js";

// Structured output closed loop (schema validate → retry with issues → degrade/hitl)
export {
  StructuredParseError,
  StructuredExhaustedError,
  isStructuredParseError,
  isStructuredExhaustedError,
  parseJsonWithSchema,
  extractJsonObject,
  extractJsonArray,
  generateStructured,
  DomainSchema,
  TaskPlanSchema,
  RouteDecisionArraySchema,
  ReplanRemainingArraySchema,
  RefinedRequirementsArraySchema,
  toolNameMatchesPattern,
  filterToolsByPatterns,
  mcpPatternsFromAllowedTools,
  resolveExposedMcpTools,
  stripAndMergeMcpToolNames,
} from "./core/structured/index.js";
export type {
  StructuredExhaustedMode,
  ParseJsonWithSchemaOptions,
  GenerateStructuredOptions,
  GenerateStructuredResult,
  TaskPlanParsed,
  RouteDecisionParsed,
  ReplanRemainingParsed,
  RefinedRequirementsParsed,
  McpExposeMode,
  ResolveExposedMcpToolsInput,
} from "./core/structured/index.js";


// Multi-agent runaway guards + Handoff (paradigm III)
export {
  AgentCallGuard,
  invokeSubAgent,
  MultiAgentGuardError,
  isMultiAgentGuardError,
  runFanOutBatches,
  assertFanOut,
  distillHandoff,
  formatHandoffForPrompt,
  validateHandoff,
  HandoffViolationError,
  isHandoffViolationError,
  AgentInvokeTool,
  AGENT_INVOKE_TOOL_NAME,
  seedHandoffsFromResults,
  collectHandoffsForPrompt,
} from "./core/multiagent/index.js";
export type {
  CallContext,
  AgentCallGuardOptions,
  FanOutBatchInfo,
  DistillHandoffInput,
  HandoffPayload,
  HandoffLimits,
  AgentInvokeToolOptions,
  SeedHandoffViolation,
  CollectHandoffsResult,
} from "./core/multiagent/index.js";
