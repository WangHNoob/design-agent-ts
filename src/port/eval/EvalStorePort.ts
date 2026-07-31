import type { EvalScore, EvalTask, EvalReport } from "./types.js";

/**
 * Persistence for Eval tasks and scores.
 * V1 ships with an in-memory implementation; Postgres can plug in later.
 */
export interface EvalStorePort {
  createTask(task: EvalTask): Promise<EvalTask>;
  updateTask(taskId: string, patch: Partial<EvalTask>): Promise<EvalTask | null>;
  getTask(taskId: string): Promise<EvalTask | null>;
  appendScore(score: EvalScore): Promise<void>;
  listScores(taskId: string): Promise<EvalScore[]>;
  getReport(taskId: string): Promise<EvalReport | null>;
}
