import type { Domain } from "./TaskPlan.js";

export interface TaskResult {
  readonly taskId: string;
  readonly domain: Domain;
  readonly status: "success" | "error" | "pending" | "rejected" | "cancelled" | "skipped";
  readonly output: string;
  readonly errorMessage: string | null;
}
