import type { SkillPort } from "./SkillPort.js";

export interface SkillRegistry {
  register(skill: SkillPort): void;
  matchSkill(requirement: string, role: string): SkillPort | null;
  getAll(): SkillPort[];
}
