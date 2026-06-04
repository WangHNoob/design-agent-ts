import type { SkillPort } from "../../port/skill/SkillPort.js";
import type { SkillWorkflow } from "../../port/skill/SkillPort.js";
import type { WorkflowTask } from "../../core/schema/TaskPlan.js";

/**
 * Simple SkillWorkflow implementation with empty defaults.
 */
class EmptySkillWorkflow implements SkillWorkflow {
  readonly steps: string[] = [];
  readonly dependencies: Record<string, string[]> = {};

  getExecutionOrder(): string[][] {
    return [];
  }
}

/**
 * Skill implementation backed by a Markdown SKILL.md file.
 * Matches roles by extracting the target Agent name from the description.
 */
export class MarkdownSkill implements SkillPort {
  private expectedRole: string | null = null;

  constructor(
    private readonly skillName: string,
    private readonly skillDescription: string,
    private readonly content: string
  ) {
    // Extract agent name from description, e.g. "指导 SystemDesignerAgent 完成..."
    const agentMatch = this.skillDescription.match(/指导\s+([A-Za-z]+)Agent/);
    if (agentMatch && agentMatch[1]) {
      const agentName = agentMatch[1];
      // Convert PascalCase agent name to snake_case role, e.g. SystemDesigner -> system_designer
      this.expectedRole = agentName
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .toLowerCase()
        .replace(/_agent$/, ""); // strip trailing _agent if any
    }
  }

  getName(): string {
    return this.skillName;
  }

  getDescription(): string {
    return this.skillDescription;
  }

  getWorkflow(): SkillWorkflow {
    // TODO: parse workflow steps from markdown content when needed
    return new EmptySkillWorkflow();
  }

  match(requirement: string, role: string): number {
    const normalizedRole = role.toLowerCase();
    const normalizedName = this.skillName.toLowerCase();

    // Exact role match derived from agent name in description
    if (this.expectedRole && normalizedRole === this.expectedRole) {
      return 100;
    }

    // Direct name match after normalizing separators
    const roleAsSkillName = normalizedRole.replace(/_/g, "-");
    if (roleAsSkillName === normalizedName) {
      return 95;
    }

    // Designer roles often map to -design skills
    if (normalizedRole.endsWith("_designer")) {
      const prefix = normalizedRole.replace(/_designer$/, "");
      if (prefix === normalizedName.replace(/-design$/, "")) {
        return 90;
      }
    }

    // Planner roles often map to -planning skills
    if (normalizedRole.endsWith("_planner")) {
      const prefix = normalizedRole.replace(/_planner$/, "");
      if (prefix === normalizedName.replace(/-planning$/, "")) {
        return 90;
      }
    }

    // Keyword overlap fallback
    const roleWords = normalizedRole.split(/[_-]/);
    const nameWords = normalizedName.split(/[_-]/);
    const common = roleWords.filter((w) => nameWords.includes(w));
    let score = common.length * 25;

    // Boost if requirement contains skill-related keywords
    const lowerReq = requirement.toLowerCase();
    for (const word of nameWords) {
      if (word.length > 2 && lowerReq.includes(word)) {
        score += 5;
      }
    }

    return score;
  }

  getWorkflowTasks(): readonly WorkflowTask[] {
    return [];
  }

  getKeywords(): readonly string[] {
    return [];
  }
}
