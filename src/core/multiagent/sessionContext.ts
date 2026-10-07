/**
 * 会话上下文注入：把客户端带来的多轮会话历史蒸馏为一段 prompt 背景块。
 *
 * 与 distillHandoff 同类的启发式实现——零额外 LLM 成本、纯函数、层界安全
 * （仅依赖类型，不触基础设施）。design/table 模式的历史目前止步于
 * DirectorAgent 门口；本模块让"一会话三模式"共享上下文成为可能：
 * 查知识 → 出策划案 → 配表 全程不需要重新交代背景。
 */

export interface SessionHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SessionContextLimits {
  /** 注入的末尾消息条数上限。0 = 功能关闭（kill-switch）。 */
  maxMessages: number;
  /** 整块字符预算，超限从头部裁剪。0 = 功能关闭。 */
  maxChars: number;
  /** 单条消息截断长度（字符）。默认 800。 */
  maxMessageChars?: number;
}

const DEFAULT_MAX_MESSAGE_CHARS = 800;

function renderRole(role: SessionHistoryMessage["role"]): string {
  return role === "user" ? "【用户】" : "【助手】";
}

/**
 * 构建会话背景块。空历史 / 任一上限为 0 → 返回空串（调用方按"无上下文"处理）。
 *
 * 取末尾 N 条（尾部优先），单条超长截断；总预算超限时从头部整条丢弃并
 * 标注省略数。块尾固定附加优先级声明：历史仅作背景，本次任务以任务需求为准。
 */
export function buildSessionContextBlock(
  history: readonly SessionHistoryMessage[] | undefined,
  limits: SessionContextLimits,
): string {
  const maxMessages = Math.floor(limits.maxMessages);
  const maxChars = Math.floor(limits.maxChars);
  if (!history || history.length === 0 || maxMessages <= 0 || maxChars <= 0) {
    return "";
  }
  const maxMessageChars = Math.max(
    1,
    Math.floor(limits.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS),
  );

  const tail = history.slice(-maxMessages);
  const omittedAtHead = history.length - tail.length;
  const rendered = tail.map((message) => {
    let content = (message.content ?? "").replace(/\r\n/g, "\n").trim();
    if (content.length > maxMessageChars) {
      content = content.slice(0, maxMessageChars).trimEnd() + "…";
    }
    return `${renderRole(message.role)}${content}`;
  });

  let body = rendered.join("\n");
  let omittedNote = omittedAtHead > 0 ? `（更早 ${omittedAtHead} 条已省略）\n` : "";

  // 总预算超限：先整条丢弃头部消息；只剩单条仍超限时，保留该消息的尾部。
  const dropped: string[] = [];
  const dropOldest = () => {
    const droppedMsg = rendered[dropped.length];
    if (droppedMsg !== undefined) {
      dropped.push(droppedMsg);
    }
  };
  while (omittedNote.length + body.length > maxChars && rendered.length - dropped.length > 1) {
    dropOldest();
    const remaining = rendered.slice(dropped.length);
    const omittedTotal = omittedAtHead + dropped.length;
    omittedNote = `（更早 ${omittedTotal} 条已省略）\n`;
    body = remaining.join("\n");
  }
  if (omittedNote.length + body.length > maxChars) {
    body = "…" + body.slice(-(maxChars - omittedNote.length));
  }

  return [
    "## 会话背景（本会话此前的对话摘要）",
    omittedNote + body,
    "> 历史仅作背景参考；本次任务以任务需求为准，历史与需求冲突时以需求为准。",
    "",
  ].join("\n");
}
