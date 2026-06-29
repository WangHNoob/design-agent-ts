import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";

export class ToolManager implements ToolRegistry {
  private tools = new Map<string, ToolPort>();
  private toolGroups = new Map<string, Set<string>>();

  register(tool: ToolPort): void {
    const descriptor = tool.getDescriptor();
    this.tools.set(descriptor.name, tool);
  }

  /**
   * Register a tool as part of a group.
   * Groups allow bulk enable/disable of related tools.
   */
  registerToGroup(tool: ToolPort, groupName: string): void {
    const descriptor = tool.getDescriptor();
    this.tools.set(descriptor.name, tool);

    if (!this.toolGroups.has(groupName)) {
      this.toolGroups.set(groupName, new Set());
    }
    this.toolGroups.get(groupName)!.add(descriptor.name);
  }

  /**
   * Unregister all tools in a group.
   * Returns the names of tools that were removed.
   */
  unregisterGroup(groupName: string): string[] {
    const group = this.toolGroups.get(groupName);
    if (!group) return [];

    const removed: string[] = [];
    for (const toolName of group) {
      this.tools.delete(toolName);
      removed.push(toolName);
    }
    this.toolGroups.delete(groupName);
    return removed;
  }

  /**
   * Get all tool names in a group.
   */
  getGroupToolNames(groupName: string): string[] {
    const group = this.toolGroups.get(groupName);
    return group ? Array.from(group) : [];
  }

  /**
   * Get all registered group names.
   */
  getGroupNames(): string[] {
    return Array.from(this.toolGroups.keys());
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
