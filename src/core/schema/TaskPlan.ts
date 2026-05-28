export type Domain =
  | "system_design"
  | "combat_design"
  | "numerical_planning"
  | "gameplay_design"
  | "executive_planning"
  | "qa";

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
}
