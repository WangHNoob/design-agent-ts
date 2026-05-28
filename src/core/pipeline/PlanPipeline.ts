import type { TaskPlan, SubTask } from "../schema/TaskPlan.js";
import type { TaskResult } from "../schema/TaskResult.js";

export class PlanPipeline {
  private layers: string[][];

  constructor(
    private plan: TaskPlan,
    private executor: (task: SubTask) => Promise<TaskResult>
  ) {
    this.layers = this.topologicalSort(plan);
  }

  async execute(): Promise<TaskResult[]> {
    const allResults: TaskResult[] = [];

    for (const layer of this.layers) {
      const layerTasks = layer
        .map((id) => this.plan.subTasks.find((t) => t.id === id))
        .filter((t): t is SubTask => t !== undefined);

      const layerResults = await Promise.all(
        layerTasks.map((task) => this.executor(task))
      );

      allResults.push(...layerResults);
    }

    return allResults;
  }

  getLayers(): string[][] {
    return this.layers;
  }

  private topologicalSort(plan: TaskPlan): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of plan.subTasks) {
      inDegree.set(task.id, task.dependencies.length);
      for (const dep of task.dependencies) {
        const list = adjacency.get(dep) ?? [];
        list.push(task.id);
        adjacency.set(dep, list);
      }
    }

    const layers: string[][] = [];
    let queue = plan.subTasks
      .filter((t) => t.dependencies.length === 0)
      .map((t) => t.id);

    while (queue.length > 0) {
      layers.push([...queue]);
      const nextQueue: string[] = [];
      for (const id of queue) {
        for (const neighbor of adjacency.get(id) ?? []) {
          const deg = (inDegree.get(neighbor) ?? 0) - 1;
          inDegree.set(neighbor, deg);
          if (deg === 0) nextQueue.push(neighbor);
        }
      }
      queue = nextQueue;
    }

    return layers;
  }
}
