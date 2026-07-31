import type { EvalReport, EvalScore, EvalTask } from "../../port/eval/types.js";
import type { EvalStorePort } from "../../port/eval/EvalStorePort.js";

function buildSummary(scores: readonly EvalScore[]): EvalReport["summary"] {
  const total = scores.length;
  const passed = scores.filter((s) => s.passed).length;
  const failed = total - passed;
  const averageScore =
    total === 0 ? 0 : scores.reduce((sum, s) => sum + s.score, 0) / total;

  const byMetric: Record<string, { total: number; passed: number; averageScore: number }> = {};
  for (const s of scores) {
    const bucket = byMetric[s.metricId] ?? { total: 0, passed: 0, averageScore: 0 };
    const nextTotal = bucket.total + 1;
    const nextPassed = bucket.passed + (s.passed ? 1 : 0);
    const nextAvg = (bucket.averageScore * bucket.total + s.score) / nextTotal;
    byMetric[s.metricId] = {
      total: nextTotal,
      passed: nextPassed,
      averageScore: nextAvg,
    };
  }

  return {
    total,
    passed,
    failed,
    passRate: total === 0 ? 0 : passed / total,
    averageScore,
    byMetric,
  };
}

export class InMemoryEvalStore implements EvalStorePort {
  private readonly tasks = new Map<string, EvalTask>();
  private readonly scores = new Map<string, EvalScore[]>();

  async createTask(task: EvalTask): Promise<EvalTask> {
    this.tasks.set(task.id, task);
    this.scores.set(task.id, []);
    return task;
  }

  async updateTask(taskId: string, patch: Partial<EvalTask>): Promise<EvalTask | null> {
    const existing = this.tasks.get(taskId);
    if (!existing) return null;
    const updated: EvalTask = { ...existing, ...patch, id: existing.id };
    this.tasks.set(taskId, updated);
    return updated;
  }

  async getTask(taskId: string): Promise<EvalTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async appendScore(score: EvalScore): Promise<void> {
    const list = this.scores.get(score.taskId) ?? [];
    list.push(score);
    this.scores.set(score.taskId, list);
  }

  async listScores(taskId: string): Promise<EvalScore[]> {
    return [...(this.scores.get(taskId) ?? [])];
  }

  async getReport(taskId: string): Promise<EvalReport | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const scores = await this.listScores(taskId);
    return { task, scores, summary: buildSummary(scores) };
  }
}
