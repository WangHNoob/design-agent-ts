import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import type { BlackboardPort } from "../../port/blackboard/BlackboardPort.js";
import { CachingToolWrapper } from "./CachingToolWrapper.js";

/**
 * 装饰一个 {@link ToolRegistry}，对白名单内的工具在解析（{@link getTool}）时
 * 套上 {@link CachingToolWrapper}，使其工具调用经由会话级黑板透明去重。
 *
 * 非白名单工具原样透传。职责单一，不改动被装饰的 registry。
 */
export class CachingToolRegistry implements ToolRegistry {
  /** 工具名 → TTL 秒数；不在表中的白名单工具使用 defaultTtlSeconds。 */
  constructor(
    private readonly base: ToolRegistry,
    private readonly blackboard: BlackboardPort,
    private readonly cachedTools: Set<string>,
    private readonly defaultTtlSeconds: number,
    private readonly ttlOverrides: Map<string, number>,
    private readonly agentType: string
  ) {}

  register(tool: ToolPort): void {
    this.base.register(tool);
  }

  getToolDescriptors(): ToolDescriptor[] {
    return this.base.getToolDescriptors();
  }

  getTool(name: string): ToolPort | undefined {
    const tool = this.base.getTool(name);
    if (!tool || !this.cachedTools.has(name)) {
      return tool;
    }
    const ttl = this.ttlOverrides.get(name) ?? this.defaultTtlSeconds;
    return new CachingToolWrapper(tool, this.blackboard, ttl, this.agentType);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return ToolResult.error(`Tool not found: ${name}`);
    }
    return tool.execute(args);
  }
}
