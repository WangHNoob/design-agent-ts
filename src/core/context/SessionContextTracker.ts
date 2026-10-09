/**
 * 会话上下文计量：记录每个会话最近一次 LLM 调用模型实际收到的
 * input tokens（真实上下文长度，非估算）与该模型的上下文窗口。
 *
 * 语义：**最近一次调用为准**——同一执行内上下文单调增长，最后一次
 * 调用即峰值；压缩发生后下一次调用的 input 会回落，latest 如实反映。
 * 进程内 Map + 执行结束时由 worker 持久化到 sessions 表（重启不丢）。
 */

export interface SessionContextUsage {
  /** 最近一次 LLM 调用的 input tokens */
  tokens: number;
  /** 该模型的上下文窗口（models.dev 注册表），未知为 null */
  window: number | null;
  /** 产生该记录的模型名 */
  model: string | null;
  updatedAt: string;
}

const store = new Map<string, SessionContextUsage>();

export function recordSessionContext(
  sessionId: string,
  usage: { tokens: number; window: number | null; model: string | null },
): void {
  if (!sessionId || !(usage.tokens > 0)) return;
  store.set(sessionId, {
    tokens: usage.tokens,
    window: usage.window,
    model: usage.model,
    updatedAt: new Date().toISOString(),
  });
}

export function getSessionContextUsage(sessionId: string): SessionContextUsage | null {
  return store.get(sessionId) ?? null;
}

/**
 * 压缩预算展示口径（与 ContextManagementHook 的触发线一致）：
 * threshold × min(模型窗口, 全局上限)。窗口未知时按全局上限。
 */
export function effectiveContextBudget(
  window: number | null,
  contextMaxTokens: number,
  threshold: number,
): number | null {
  const base = window && window > 0 ? Math.min(window, contextMaxTokens) : contextMaxTokens;
  if (!(base > 0)) return null;
  return Math.round(base * threshold);
}
