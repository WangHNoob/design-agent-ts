import type { AgentDescriptor } from "../../port/agent/AgentDescriptor.js";
import type { Domain } from "./TaskPlan.js";

export interface TaskAssignment {
  readonly taskId: string;
  readonly domain: Domain;
  readonly assignment: string;
  readonly agentDescriptor: AgentDescriptor;
  readonly dependencies?: string[];
  /** Resolved step tool whitelist (may be empty = no tools). */
  readonly allowedTools?: readonly string[];
}
