/** 上报用户侧信号（flywheel 03-P4）：复制/评分时上报，供观测台在线评测采样。
 *  独立成 lib 模块：避免使用方为这一个工具函数把整个 ResultPanel（含
 *  react-markdown 重依赖）拖进 bundle 关键路径。 */

export function reportUserSignal(input: {
  kind: 'copied' | 'rated';
  sessionId?: string | null;
  executionId?: string | null;
  traceId?: string | null;
  rating?: number;
}) {
  const { kind, sessionId, executionId, traceId, rating } = input;
  if (!sessionId && !executionId) return;
  void fetch('/api/user-signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sessionId, executionId, traceId, rating }),
    credentials: 'include',
  }).catch(() => {});
}
