import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { BlackboardPort } from "../../port/blackboard/BlackboardPort.js";

/** 黑板要点截断展示长度（search / recent 列表中每条 value 的预览字符数）。 */
const PREVIEW_LEN = 120;

/**
 * Agent 可见的黑板工具（按 action 分发）。
 *
 * 让子 Agent 在多 Agent 协作时显式读写共享要点：记录已确认的领域事实、
 * 检索其他 Agent 留下的要点，避免重复探索。
 *
 * 在 bootstrap / Director 中通过 {@link import("./DelegatingTool.js").DelegatingTool}
 * 拆分为 blackboard_write / blackboard_read / blackboard_search / blackboard_recent 四个具名工具。
 * 由于黑板按会话隔离，本工具在 Director 构造会话工具表时现场绑定对应会话的黑板。
 */
export class BlackboardTool implements ToolPort {
  /**
   * @param blackboard 当前会话的黑板。
   * @param agentType 当前写入方标签（任务 domain / 子 Agent 名）。
   * @param defaultTtlSeconds blackboard_write 未指定 ttl 时的默认存活秒数。
   */
  constructor(
    private readonly blackboard: BlackboardPort,
    private readonly agentType: string,
    private readonly defaultTtlSeconds: number
  ) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: "blackboard",
      description:
        "团队共享黑板：在多 Agent 协作中记录/检索关键知识要点，避免重复搜索。" +
        "action=write 写入要点；read 按 key 读取；search 按关键字检索；recent 列出最近要点。",
      parameters: {
        action: {
          name: "action",
          type: "string",
          description: "操作类型",
          required: true,
          enum: ["write", "read", "search", "recent"],
        },
        key: {
          name: "key",
          type: "string",
          description: "记录的键（write/read 必填）",
          required: false,
        },
        value: {
          name: "value",
          type: "string",
          description: "记录的内容（write 必填）",
          required: false,
        },
        keyword: {
          name: "keyword",
          type: "string",
          description: "检索关键字（search 必填）",
          required: false,
        },
        limit: {
          name: "limit",
          type: "number",
          description: "recent 返回条数，默认 5",
          required: false,
        },
        ttl_seconds: {
          name: "ttl_seconds",
          type: "number",
          description: "write 的存活秒数，默认使用系统配置",
          required: false,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action ?? "");
    switch (action) {
      case "write":
        return this.write(args);
      case "read":
        return this.read(args);
      case "search":
        return this.search(args);
      case "recent":
        return this.recent(args);
      default:
        return ToolResult.error(`未知的 blackboard action: "${action}"`);
    }
  }

  private write(args: Record<string, unknown>): ToolResult {
    const key = typeof args.key === "string" ? args.key : "";
    const value = typeof args.value === "string" ? args.value : "";
    if (!key || !value) {
      return ToolResult.error("blackboard write 需要 key 和 value");
    }
    const ttl = typeof args.ttl_seconds === "number" ? args.ttl_seconds : this.defaultTtlSeconds;
    this.blackboard.write(key, value, this.agentType, this.agentType, ttl);
    return ToolResult.success(`已写入黑板：${key}`);
  }

  private read(args: Record<string, unknown>): ToolResult {
    const key = typeof args.key === "string" ? args.key : "";
    if (!key) {
      return ToolResult.error("blackboard read 需要 key");
    }
    const entry = this.blackboard.read(key);
    if (!entry) {
      return ToolResult.success(`黑板中无记录：${key}`);
    }
    return ToolResult.success(entry.value);
  }

  private search(args: Record<string, unknown>): ToolResult {
    const keyword = typeof args.keyword === "string" ? args.keyword : "";
    if (!keyword) {
      return ToolResult.error("blackboard search 需要 keyword");
    }
    const entries = this.blackboard.search(keyword);
    if (entries.length === 0) {
      return ToolResult.success(`黑板中未找到与「${keyword}」相关的记录`);
    }
    return ToolResult.success(entries.map((e) => this.format(e.agentType, e.key, e.value)).join("\n"));
  }

  private recent(args: Record<string, unknown>): ToolResult {
    const limit = typeof args.limit === "number" ? args.limit : 5;
    const entries = this.blackboard.listRecent(limit);
    if (entries.length === 0) {
      return ToolResult.success("黑板暂无记录");
    }
    return ToolResult.success(entries.map((e) => this.format(e.agentType, e.key, e.value)).join("\n"));
  }

  private format(agentType: string, key: string, value: string): string {
    const preview = value.length > PREVIEW_LEN ? value.slice(0, PREVIEW_LEN) + "…" : value;
    return `[${agentType}] ${key}: ${preview}`;
  }
}
