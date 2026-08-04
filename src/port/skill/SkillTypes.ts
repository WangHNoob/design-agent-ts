/**
 * Skill-domain types shared between the port contract and core.
 *
 * These types live in the port layer on purpose: `SkillPort` must be able to
 * describe workflow task definitions without depending on `core/` (layer
 * boundary: ports never import core). `core/schema/TaskPlan.ts` re-exports
 * them for backward compatibility.
 */

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
