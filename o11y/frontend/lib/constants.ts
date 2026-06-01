// ── Semantic color system ──────────────────────────────────────────────────
// Vivid borders + pastel fills for crisp light-theme readability

export const SPAN_TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LLM:          { label: "LLM",      color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200" },
  TOOL:         { label: "TOOL",     color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200" },
  RETRIEVER:    { label: "检索",     color: "text-sky-700",    bg: "bg-sky-50",     border: "border-sky-200" },
  AGENT_CHAIN:  { label: "AGENT",    color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-200" },
  PIPELINE:     { label: "PIPE",     color: "text-cyan-700",   bg: "bg-cyan-50",    border: "border-cyan-200" },
  STEP:         { label: "STEP",     color: "text-slate-700",  bg: "bg-slate-100",  border: "border-slate-200" },
  HITL:         { label: "HITL",     color: "text-rose-700",   bg: "bg-rose-50",    border: "border-rose-200" },
  REQUEST:      { label: "API",      color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200" },
  FORMAT:       { label: "FMT",      color: "text-teal-700",   bg: "bg-teal-50",    border: "border-teal-200" },
  DIRECTOR:     { label: "DIR",      color: "text-indigo-700", bg: "bg-indigo-50",  border: "border-indigo-200" },
  INTEGRATOR:   { label: "INT",      color: "text-pink-700",   bg: "bg-pink-50",    border: "border-pink-200" },
};

export const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  ok:      { label: "成功",   color: "text-emerald-600", dot: "bg-emerald-500 ring-2 ring-emerald-100" },
  error:   { label: "失败",   color: "text-red-600",     dot: "bg-red-500 ring-2 ring-red-100" },
  running: { label: "运行中", color: "text-amber-600",   dot: "bg-amber-500 ring-2 ring-amber-100 animate-pulse" },
};

// ── Thinking / reasoning ─────────────────────────────────────────────────────
export const THINKING_FIELDS = ["reasoning_content", "thinking", "reasoning", "chain_of_thought"];

export const THINKING_META = {
  label: "思考过程",
  color: "text-amber-700",
  bg: "bg-amber-50",
  border: "border-amber-200",
};

// ── Runtime status phases ────────────────────────────────────────────
export const PHASE_META: Record<string, { label: string; color: string; bg: string }> = {
  PLANNING:     { label: "任务规划",  color: "text-blue-800",    bg: "bg-blue-100" },
  PIPELINE:     { label: "管道执行",  color: "text-cyan-800",    bg: "bg-cyan-100" },
  AGENT:        { label: "Agent",     color: "text-emerald-800", bg: "bg-emerald-100" },
  LLM:          { label: "LLM 推理",  color: "text-violet-800",  bg: "bg-violet-100" },
  HITL_WAIT:    { label: "等待审核",  color: "text-rose-800",    bg: "bg-rose-100" },
  INTEGRATING:  { label: "结果整合",  color: "text-pink-800",    bg: "bg-pink-100" },
  COMPLETE:     { label: "执行完成",  color: "text-green-800",   bg: "bg-green-100" },
};

// ── Terminology map (English value → Chinese display) ───────────────────────
export const L10N: Record<string, string> = {
  trace: "链路追踪",
  span: "执行步骤",
  session: "会话",
  prompt: "提示词",
  completion: "模型输出",
  metadata: "元数据",
  input: "入参",
  output: "出参",
  duration: "耗时",
  tokens: "Token",
  status: "状态",
  name: "名称",
  type: "类型",
  tool: "工具",
  model: "模型",
};
