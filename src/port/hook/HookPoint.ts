export type HookPoint =
  | "pre_reasoning"
  | "post_reasoning"
  | "pre_tool_execution"
  | "post_tool_execution"
  | "pre_agent_call"
  | "post_agent_call"
  | "pre_summary"
  | "post_summary"
  | "on_error"
  | "on_iteration_budget";
