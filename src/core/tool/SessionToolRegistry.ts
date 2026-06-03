import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import { ToolResult as TR } from "../../port/tool/ToolResult.js";

/**
 * Wraps a global ToolRegistry and overlays session-scoped tools (e.g. workspace tools).
 * Session tools take precedence over base tools with the same name.
 */
export class SessionToolRegistry implements ToolRegistry {
  private sessionToolMap: Map<string, ToolPort>;

  constructor(
    private base: ToolRegistry,
    sessionTools: ToolPort[]
  ) {
    this.sessionToolMap = new Map(sessionTools.map((t) => [t.getDescriptor().name, t]));
  }

  register(tool: ToolPort): void {
    this.base.register(tool);
  }

  getToolDescriptors(): ToolDescriptor[] {
    const baseDescriptors = this.base.getToolDescriptors();
    const sessionDescriptors = [...this.sessionToolMap.values()].map((t) => t.getDescriptor());
    const baseFiltered = baseDescriptors.filter((d) => !this.sessionToolMap.has(d.name));
    return [...baseFiltered, ...sessionDescriptors];
  }

  getTool(name: string): ToolPort | undefined {
    return this.sessionToolMap.get(name) ?? this.base.getTool(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return TR.error(`Tool not found: ${name}`);
    }
    return tool.execute(args);
  }
}
