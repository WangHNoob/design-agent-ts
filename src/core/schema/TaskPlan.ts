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
}

export interface SubTask {
  readonly id: string;
  readonly fragmentId: string;
  readonly domain: Domain;
  readonly description: string;
  readonly dependencies: string[];
  readonly priority: number;
}

export interface TaskPlan {
  readonly planId: string;
  readonly requirement: string;
  readonly subTasks: SubTask[];
  /** Set when the plan was derived from a workflow skill. */
  readonly skillId?: string;
}
