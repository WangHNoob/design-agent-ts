import type { TaskResult } from "../../schema/TaskResult.js";

export class Integrator {
  integrate(results: TaskResult[]): string {
    const sections = results.map((r) => {
      const status = r.status === "success" ? "✓" : "✗";
      return `## ${r.domain} ${status}\n\n${r.output}\n`;
    });

    return `# 整合报告\n\n${sections.join("\n")}`;
  }

  detectConflicts(results: TaskResult[]): string[] {
    const conflicts: string[] = [];
    const outputs = results.map((r) => r.output.toLowerCase());

    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        const outI = outputs[i]!;
        const outJ = outputs[j]!;
        if (outI.includes("conflict") && outJ.includes("conflict")) {
          conflicts.push(`Conflict detected between ${results[i]!.domain} and ${results[j]!.domain}`);
        }
      }
    }

    return conflicts;
  }
}
