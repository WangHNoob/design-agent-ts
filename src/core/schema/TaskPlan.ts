export type Domain =
  | "system_design"
  | "combat_design"
  | "numerical_planning"
  | "gameplay_design"
  | "executive_planning"
  | "qa";

export type OutputType = "DOCUMENT" | "CONFIG_TABLE" | "MIXED";

/**
 * A task definition from a workflow SKILL.md (contrib/workflows/).
 * The task structure (id, domain, dependencies, output) is fixed by the workflow author;
 * only the `requirement` text is refined by LLM at planning time.
 */
export interface WorkflowTask {
  readonly taskId: string;
  readonly domain: Domain;
  readonly requirementTemplate: string;
  readonly dependencies: readonly string[];
  readonly outputType: OutputType;
  readonly outputTemplate: string;
  /**
   * Optional per-task tool whitelist.
   * - omitted: use domain defaults at execution time
   * - `[]`: no external tools allowed (strict empty set)
   */
  readonly allowedTools?: readonly string[];
}

export interface SubTask {
  readonly id: string;
  readonly fragmentId: string;
  readonly domain: Domain;
  readonly description: string;
  readonly dependencies: string[];
  readonly priority: number;
  /**
   * Step-level tool whitelist for plan hard guards.
   * - omitted / undefined: resolve via domain defaults (`planDomainToolDefaults` / core defaults)
   * - empty array `[]`: **no external tools** — only agent reasoning without tool calls
   * - non-empty: intersected with `AgentDescriptor.toolNames` (+ session tools when listed)
   */
  readonly allowedTools?: readonly string[];
}

export interface TaskPlan {
  readonly planId: string;
  readonly requirement: string;
  readonly subTasks: SubTask[];
  /** Set when the plan was derived from a workflow skill. */
  readonly skillId?: string;
  /**
   * Auditable mark: structured LLM parse exhausted and a fallback plan was used.
   * Never treat a silent empty plan as success — prefer this flag or a loud failure.
   */
  readonly fallback?: boolean;
  /** Alias of fallback for parse-path degradation (structured output closed loop). */
  readonly parseFallback?: boolean;
  /** Human-readable planning warnings (LLM degrade / template fallback). Surfaced on SSE. */
  readonly warnings?: readonly string[];
}
