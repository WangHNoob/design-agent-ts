import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";

export class ToolManager implements ToolRegistry {
  private tools = new Map<string, ToolPort>();

  register(tool: ToolPort): void {
    const descriptor = tool.getDescriptor();
    this.tools.set(descriptor.name, tool);
  }

  getToolDescriptors(): ToolDescriptor[] {
    return Array.from(this.tools.values()).map((t) => t.getDescriptor());
  }

  getTool(name: string): ToolPort | undefined {
    return this.tools.get(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return ToolResult.error(`Tool "${name}" not found`);
    }
    return tool.execute(args);
  }
}
