import type { SkillWorkflow } from "../../port/skill/SkillPort.js";

export class SkillWorkflowImpl implements SkillWorkflow {
  readonly steps: string[];
  readonly dependencies: Record<string, string[]>;

  constructor(steps: string[], dependencies: Record<string, string[]>) {
    this.steps = steps;
    this.dependencies = dependencies;
  }

  getExecutionOrder(): string[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of this.steps) {
      const deps = this.dependencies[step] ?? [];
      inDegree.set(step, deps.length);
      for (const dep of deps) {
        const list = adjacency.get(dep) ?? [];
        list.push(step);
        adjacency.set(dep, list);
      }
    }

    const layers: string[][] = [];
    let queue = this.steps.filter((s) => (inDegree.get(s) ?? 0) === 0);

    while (queue.length > 0) {
      layers.push([...queue]);
      const nextQueue: string[] = [];
      for (const step of queue) {
        for (const neighbor of adjacency.get(step) ?? []) {
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
