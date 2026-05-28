import type { Domain } from "./TaskPlan.js";

export interface RouteDecision {
  readonly fragmentId: string;
  readonly domain: Domain;
  readonly agentName: string;
  readonly assignment: string;
  readonly priority: number;
}
