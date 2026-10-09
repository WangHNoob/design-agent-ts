import type { ToolPort } from "./ToolPort.js";
import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolResult } from "./ToolResult.js";

export interface ToolRegistry {
  /**
   * 工具集是否绑定单个会话（workspace/blackboard 等 session 工具）。
   * Agent 工厂据此决定能否按名缓存 agent 实例：session-scoped 的工具
   * 每次调用都不同（绑定不同 sessionId），缓存会把上一个会话的工具
   * 带进下一个会话（实测导致读错工作区、跨会话黑板），必须禁用。
   */
  readonly sessionScoped: boolean;
  register(tool: ToolPort): void;
  getToolDescriptors(): ToolDescriptor[];
  getTool(name: string): ToolPort | undefined;
  executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
