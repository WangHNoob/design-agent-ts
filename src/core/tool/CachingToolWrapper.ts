import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { BlackboardPort } from "../../port/blackboard/BlackboardPort.js";

/** 命中黑板缓存时输出内容的前缀标记（便于人工审计与端到端验证）。 */
export const CACHE_HIT_PREFIX = "[来自黑板缓存]\n";

/**
 * 为工具参数生成稳定的缓存键：按键名排序后序列化，保证参数顺序无关。
 */
export function makeCacheKey(toolName: string, args: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(args).sort()) {
    sorted[k] = args[k];
  }
  return `${toolName}:${JSON.stringify(sorted)}`;
}

/**
 * 透明读穿（read-through）缓存装饰器。
 *
 * 装饰一个 base 工具，在 {@link execute} 层（LangGraph 实际调用路径）拦截：
 * 命中黑板则直接返回缓存内容；未命中则调用 base 工具并将成功结果写回黑板。
 * 对 LLM 完全透明——{@link getDescriptor} 原样透传 base 描述符。
 */
export class CachingToolWrapper implements ToolPort {
  constructor(
    private readonly base: ToolPort,
    private readonly blackboard: BlackboardPort,
    private readonly ttlSeconds: number,
    private readonly agentType: string
  ) {}

  getDescriptor(): ToolDescriptor {
    return this.base.getDescriptor();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const name = this.base.getDescriptor().name;
    const key = makeCacheKey(name, args);

    const hit = this.blackboard.read(key);
    if (hit) {
      return ToolResult.success(CACHE_HIT_PREFIX + hit.value, { fromCache: true });
    }

    const result = await this.base.execute(args);
    // 仅缓存成功结果，错误不污染黑板。
    if (!result.isError) {
      this.blackboard.write(key, result.output, name, this.agentType, this.ttlSeconds);
    }
    return result;
  }
}
