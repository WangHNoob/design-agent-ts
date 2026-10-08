export interface AgentDescriptor {
  readonly name: string;
  readonly systemPrompt: string;
  readonly maxIterations: number;
  readonly maxTokens?: number;
  readonly toolNames: string[];
  /**
   * 单条工具结果进入模型上下文的最大字符数（0=不截断）。
   * 超长检索结果会撑爆上下文（评测 token 风暴根因之一），此为最后防线。
   */
  readonly toolResultMaxChars?: number;
  readonly options: Record<string, unknown>;
}
