import type { SkillPort } from "../../port/skill/SkillPort.js";
import type { SkillWorkflow } from "../../port/skill/SkillPort.js";
import type { WorkflowTask } from "../../core/schema/TaskPlan.js";

class EmptySkillWorkflow implements SkillWorkflow {
  readonly steps: string[] = [];
  readonly dependencies: Record<string, string[]> = {};

  getExecutionOrder(): string[][] {
    return [];
  }
}

/**
 * Workflow skill loaded from contrib/workflows/{name}/SKILL.md.
 *
 * Unlike agent skills (MarkdownSkill), a WorkflowSkill defines a fixed DAG
 * of tasks with explicit domains, dependencies, and output templates.
 * The DirectorAgent uses this to plan and route sub-tasks deterministically.
 *
 * Matching is keyword-based: each keyword hit in the user requirement scores
 * 10 points. The highest-scoring workflow wins.
 */
export class WorkflowSkill implements SkillPort {
  constructor(
    private readonly skillName: string,
    private readonly skillDescription: string,
    private readonly keywords: readonly string[],
    private readonly tasks: readonly WorkflowTask[],
    private readonly content: string,
  ) {}

  getName(): string {
    return this.skillName;
  }

  getDescription(): string {
    return this.skillDescription;
  }

  getWorkflow(): SkillWorkflow {
    // Build a SkillWorkflow view from the task DAG for backward compatibility.
    const steps = this.tasks.map((t) => t.taskId);
    const deps: Record<string, string[]> = {};
    for (const t of this.tasks) {
      deps[t.taskId] = [...t.dependencies];
    }
    return { steps, dependencies: deps };
  }

  getWorkflowTasks(): readonly WorkflowTask[] {
    return this.tasks;
  }

  getKeywords(): readonly string[] {
    return this.keywords;
  }

  /**
   * Keyword-based scoring against the user requirement.
   * Each keyword found in the requirement text adds 10 points.
   * chief_designer role gets a small base score so that a workflow
   * with at least one keyword match beats any agent skill.
   */
  match(requirement: string, role: string): number {
    if (role !== "chief_designer") {
      // Workflows are only for the orchestrator role.
      return 0;
    }

    const lowerReq = requirement.toLowerCase();
    let score = 0;

    for (const kw of this.keywords) {
      if (lowerReq.includes(kw.toLowerCase())) {
        score += 10;
      }
    }

    return score;
  }
}
