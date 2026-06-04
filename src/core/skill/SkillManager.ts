import type { SkillPort } from "../../port/skill/SkillPort.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";

export class SkillManager implements SkillRegistry {
  private skills: SkillPort[] = [];

  register(skill: SkillPort): void {
    this.skills.push(skill);
  }

  /**
   * Match the best skill for a given requirement and role.
   *
   * For `chief_designer` this prefers workflow skills (from contrib/workflows/)
   * when at least one keyword matches. If no workflow matches, it falls back to
   * agent skills.
   *
   * For other roles only agent skills are considered (WorkflowSkill.match()
   * returns 0 for non-chief roles).
   */
  matchSkill(requirement: string, role: string): SkillPort | null {
    if (role === "chief_designer") {
      // Try workflows first — they take priority for the orchestrator.
      const workflow = this.matchWorkflow(requirement);
      if (workflow) return workflow;
    }

    // Fall back to all skills (agent skills).
    let best: SkillPort | null = null;
    let bestScore = 0;

    for (const skill of this.skills) {
      const score = skill.match(requirement, role);
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }

    return best;
  }

  /**
   * Match only against workflow skills.
   * A workflow must score > 0 (at least one keyword hit) to be returned.
   */
  matchWorkflow(requirement: string): SkillPort | null {
    let best: SkillPort | null = null;
    let bestScore = 0;

    for (const skill of this.skills) {
      if (skill.getWorkflowTasks().length === 0) continue; // skip agent skills

      const score = skill.match(requirement, "chief_designer");
      if (score > bestScore) {
        bestScore = score;
        best = skill;
      }
    }

    return best;
  }

  getAll(): SkillPort[] {
    return [...this.skills];
  }
}
