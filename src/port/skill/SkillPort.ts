import type { WorkflowTask } from "../../core/schema/TaskPlan.js";

export interface SkillWorkflow {
  readonly steps: string[];
  readonly dependencies: Record<string, string[]>;
}

export interface SkillPort {
  getName(): string;
  getDescription(): string;
  getWorkflow(): SkillWorkflow;
  match(requirement: string, role: string): number;
  /** Returns workflow task definitions if this skill is a workflow; empty array otherwise. */
  getWorkflowTasks(): readonly WorkflowTask[];
  /** Keywords used for matching user requirements (workflow skills only). */
  getKeywords(): readonly string[];
  /** Full content of the skill file (SKILL.md markdown body). */
  getContent(): string;
}
