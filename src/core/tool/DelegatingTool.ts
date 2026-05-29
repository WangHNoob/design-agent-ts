import type { ToolPort } from "../../port/tool/ToolPort.js";
import { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";

export class DelegatingTool implements ToolPort {
  constructor(
    private overrideName: string,
    private overrideDescription: string,
    private baseTool: ToolPort,
    private fixedArgs: Record<string, unknown> = {}
  ) {}

  getDescriptor(): ToolDescriptor {
    const baseDesc = this.baseTool.getDescriptor();
    // Filter out fixed parameters
    const params: Record<string, import("../../port/tool/ToolDescriptor.js").ParameterDescriptor> = {};
    for (const [key, param] of Object.entries(baseDesc.parameters)) {
      if (!(key in this.fixedArgs)) {
        params[key] = param;
      }
    }
    return {
      name: this.overrideName,
      description: this.overrideDescription,
      parameters: params,
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return this.baseTool.execute({ ...this.fixedArgs, ...args });
  }
}
