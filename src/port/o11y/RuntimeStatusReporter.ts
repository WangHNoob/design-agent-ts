export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface RuntimeStatusCreate {
  session_id: string;
  trace_id: string;
  timestamp?: Date;
  current_phase: "PLANNING" | "PIPELINE" | "AGENT" | "LLM" | "HITL_WAIT" | "INTEGRATING" | "COMPLETE";
  progress_pct: number;
  agent_id?: string | null;
  agent_name?: string | null;
  step_description: string;
  context_used_pct?: number;
  context_compressed?: boolean;
  compressed_from?: number | null;
  compressed_to?: number | null;
  token_usage?: TokenUsage | null;
}

export interface RuntimeStatusReporter {
  postRuntimeStatus(status: RuntimeStatusCreate): Promise<{ status: string }>;
}
