import type { SkillPort } from "../../port/skill/SkillPort.js";
import type { SkillRegistry } from "../../port/skill/SkillRegistry.js";

export class SkillManager implements SkillRegistry {
  private skills: SkillPort[] = [];

  register(skill: SkillPort): void {
    this.skills.push(skill);
  }

  matchSkill(requirement: string, role: string): SkillPort | null {
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

  getAll(): SkillPort[] {
    return [...this.skills];
  }
}
