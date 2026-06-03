import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../../port/tool/ToolResult.js";
import type { WorkspaceManager } from "../../workspace/WorkspaceManager.js";

export class WorkspaceListTool implements ToolPort {
  constructor(
    private workspace: WorkspaceManager,
    private sessionId: string
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "workspace_list",
      description: "列出指定任务在工作空间中已产出的所有文件。",
      parameters: {
        task_id: {
          name: "task_id",
          type: "string",
          description: "要列出文件的任务 ID（如 TASK-001）。留空则列出所有已完成的任务。",
          required: false,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = args.task_id as string | undefined;

    if (taskId) {
      const files = await this.workspace.listTaskFiles(this.sessionId, taskId);
      if (files.length === 0) {
        return TR.success(`任务 ${taskId} 尚无产出文件。`);
      }
      return TR.success(`任务 ${taskId} 的文件: ${files.join(", ")}`, { taskId, files });
    }

    const tasks = await this.workspace.listTasks(this.sessionId);
    if (tasks.length === 0) {
      return TR.success("工作空间中尚无已完成的任务。");
    }
    return TR.success(`已完成的任务: ${tasks.join(", ")}`, { tasks });
  }
}
