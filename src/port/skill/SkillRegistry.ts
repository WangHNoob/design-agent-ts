import type { SkillPort } from "./SkillPort.js";

export interface SkillRegistry {
  register(skill: SkillPort): void;
  matchSkill(requirement: string, role: string): SkillPort | null;
  /** Match only against workflow skills (contrib/workflows/). Returns null if no workflow keywords match. */
  matchWorkflow(requirement: string): SkillPort | null;
  getAll(): SkillPort[];
}
