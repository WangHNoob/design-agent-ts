import type { ToolPort } from "../../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../../port/tool/ToolResult.js";
import { ToolResult as TR } from "../../../port/tool/ToolResult.js";
import type { WorkspaceManager } from "../../workspace/WorkspaceManager.js";

export class WorkspaceReadTool implements ToolPort {
  constructor(
    private workspace: WorkspaceManager,
    private sessionId: string
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "workspace_read",
      description: "读取其他任务在工作空间中写入的文件。用于获取前驱任务的设计产出、数据或决策上下文。",
      parameters: {
        task_id: {
          name: "task_id",
          type: "string",
          description: "要读取的任务 ID（如 TASK-001）",
          required: true,
        },
        file_name: {
          name: "file_name",
          type: "string",
          description: "文件名，默认 output.md",
          required: false,
          defaultValue: "output.md",
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const taskId = args.task_id as string;
    if (!taskId) {
      return TR.error("参数 task_id 为必填项");
    }
    const fileName = (args.file_name as string) || "output.md";

    const content = await this.workspace.readTaskOutput(this.sessionId, taskId, fileName);
    if (content === null) {
      const available = await this.workspace.listTaskFiles(this.sessionId, taskId);
      const hint = available.length > 0
        ? `可用文件: ${available.join(", ")}`
        : "该任务尚无产出文件";
      return TR.error(`[NOT FOUND] 未找到 ${taskId}/${fileName}。${hint}`);
    }

    return TR.success(content, { taskId, fileName });
  }
}
