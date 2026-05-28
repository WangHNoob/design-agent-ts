export interface SkillWorkflow {
  readonly steps: string[];
  readonly dependencies: Record<string, string[]>;
}

export interface SkillPort {
  getName(): string;
  getDescription(): string;
  getWorkflow(): SkillWorkflow;
  match(requirement: string, role: string): number;
}
